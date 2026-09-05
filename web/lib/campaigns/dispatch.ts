import "server-only";

import { assertApprovedCallReady, CallConfigurationError, executeApprovedCall } from "@/lib/calle/client";
import type { PreparedCampaignCall, PreparedCampaignLaunch } from "@/lib/campaigns/lifecycle";
import {
  recordCallSubmission,
  recordSubmissionFailure,
  reserveCampaignRuns,
} from "@/lib/db/call-lifecycle";
import { publishCallDispatch } from "@/lib/queue/rabbitmq";

export interface CallDispatchJob {
  campaignId: string;
  call: PreparedCampaignCall;
}

/**
 * Guards processCallDispatchJob against a message that isn't actually a CallDispatchJob
 * (a stray test publish, a future producer sending an incompatible shape, corrupted
 * JSON that still parses). Without this, `job.call` being undefined makes both the
 * execution attempt *and* the catch block's own error-reporting throw — a confusing
 * double-fault — since the catch block also reads `call.callResultId` to report what
 * failed. Reject cleanly here instead, before any of that runs.
 */
export function isCallDispatchJob(value: unknown): value is CallDispatchJob {
  if (typeof value !== "object" || value === null) return false;
  const job = value as Record<string, unknown>;
  if (typeof job.campaignId !== "string") return false;
  if (typeof job.call !== "object" || job.call === null) return false;
  const call = job.call as Record<string, unknown>;
  return (
    typeof call.callResultId === "string" &&
    typeof call.draft === "object" &&
    call.draft !== null &&
    typeof call.preview === "object" &&
    call.preview !== null &&
    typeof call.contact === "object" &&
    call.contact !== null
  );
}

export async function dispatchPreparedCampaign(params: {
  userId: string;
  campaignId: string;
  prepared: PreparedCampaignLaunch;
  fromStatus?: "compiled" | "scheduled";
}): Promise<{ status: "submitted" | "already_launched" }> {
  for (const call of params.prepared.calls) {
    assertApprovedCallReady(call.draft, call.preview);
  }

  const reservation = await reserveCampaignRuns({
    userId: params.userId,
    campaignId: params.campaignId,
    calls: params.prepared.calls,
    fromStatus: params.fromStatus,
  });
  if (reservation === "already_launched") {
    return { status: "already_launched" };
  }

  // Every call is now reserved (callResults rows exist with status "submitting"). Actual
  // execution happens off the request path — one queued job per call, picked up by the
  // standalone worker in scripts/dispatch-worker.ts.
  for (const call of params.prepared.calls) {
    await publishCallDispatch({ campaignId: params.campaignId, call } satisfies CallDispatchJob);
  }

  return { status: "submitted" };
}

/**
 * Runs exactly one queued call. Called by the RabbitMQ worker (scripts/dispatch-worker.ts)
 * per consumed message — this is the same body that used to run inline in the dispatch
 * loop above before dispatch moved to a queue, unchanged in behavior.
 */
export async function processCallDispatchJob(job: CallDispatchJob): Promise<void> {
  const { campaignId, call } = job;
  try {
    const execution = await executeApprovedCall(call.draft, call.preview);
    await recordCallSubmission({ campaignId, callResultId: call.callResultId, execution });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error(
      `[dispatch] call submission failed (campaignId=${campaignId} callResultId=${call.callResultId}):`,
      error,
    );
    await recordSubmissionFailure({
      campaignId,
      callResultId: call.callResultId,
      reason,
      code: error instanceof CallConfigurationError ? "configuration_error" : "submission_error",
    });
  }
}
