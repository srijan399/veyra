import "server-only";

import { assertApprovedCallReady, executeApprovedCall } from "@/lib/calle/client";
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
  } catch {
    await recordSubmissionFailure({ campaignId, callResultId: call.callResultId });
  }
}
