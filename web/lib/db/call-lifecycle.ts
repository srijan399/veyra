import "server-only";

import { and, asc, eq, isNull, lte, or } from "drizzle-orm";

import type { SafeCallExecution } from "@/lib/calle/client";
import type { PreparedCampaignCall } from "@/lib/campaigns/lifecycle";
import type { ParsedWebhookEvent } from "@/lib/calle/webhook-event";
import type { CallStatus, CampaignStatus } from "@/types/campaign";

import { getDb } from "./client";
import { callResults, campaigns, processedWebhookEvents } from "./schema";

const TERMINAL = new Set<CallStatus>([
  "completed",
  "failed",
  "canceled",
  "no_answer",
  "result_validation_failed",
  "submission_uncertain",
]);

function qualified(result: Record<string, unknown> | null): boolean | null {
  return typeof result?.qualified === "boolean" ? result.qualified : null;
}

function executionStatus(status: string): CallStatus {
  if (["queued", "in_progress", "completed", "failed", "canceled"].includes(status)) {
    return status as CallStatus;
  }
  return "submission_uncertain";
}

async function refreshCampaignStatusTx(
  tx: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0],
  campaignId: string,
): Promise<CampaignStatus> {
  const rows = await tx
    .select({ status: callResults.status })
    .from(callResults)
    .where(eq(callResults.campaignId, campaignId));
  const statuses = rows.map((row) => row.status as CallStatus);
  const allTerminal = statuses.length > 0 && statuses.every((status) => TERMINAL.has(status));
  const allFailed = allTerminal && statuses.every((status) => status !== "completed");
  const status: CampaignStatus = allTerminal ? (allFailed ? "failed" : "completed") : "launched";
  await tx.update(campaigns).set({ status }).where(eq(campaigns.id, campaignId));
  return status;
}

/**
 * The lifecycle writer intentionally uses the owner database role because call_results
 * are read-only under browser RLS. Every launch mutation re-checks campaign ownership
 * and changes only validated, server-compiled rows.
 */
export async function reserveCampaignRuns(params: {
  userId: string;
  campaignId: string;
  calls: PreparedCampaignCall[];
  fromStatus?: "compiled" | "scheduled";
}): Promise<"reserved" | "already_launched"> {
  return getDb().transaction(async (tx) => {
    const now = new Date();
    const [claimed] = await tx
      .update(campaigns)
      .set({ status: "launching", launchedAt: now })
      .where(
        and(
          eq(campaigns.id, params.campaignId),
          eq(campaigns.userId, params.userId),
          eq(campaigns.status, params.fromStatus ?? "compiled"),
        ),
      )
      .returning({ id: campaigns.id });
    if (!claimed) {
      const [existing] = await tx
        .select({ status: campaigns.status })
        .from(campaigns)
        .where(and(eq(campaigns.id, params.campaignId), eq(campaigns.userId, params.userId)))
        .limit(1);
      if (existing && existing.status !== (params.fromStatus ?? "compiled")) {
        return "already_launched";
      }
      throw new Error("Campaign is not available for launch");
    }

    await tx.insert(callResults).values(
      params.calls.map((call) => ({
        id: call.callResultId,
        campaignId: params.campaignId,
        contactId: call.contact.id,
        idempotencyKey: call.preview.idempotencyKey,
        approvalDigest: call.preview.approvalDigest,
        compiledRequest: call.draft,
        status: "submitting",
        createdAt: now,
      })),
    );
    return "reserved";
  });
}

export async function scheduleCampaign(params: {
  userId: string;
  campaignId: string;
  scheduledAt: Date;
  approvalDigest: string;
}): Promise<"scheduled" | "already_launched"> {
  const [claimed] = await getDb()
    .update(campaigns)
    .set({
      status: "scheduled",
      scheduledAt: params.scheduledAt,
      approvedAt: new Date(),
      approvalDigest: params.approvalDigest,
    })
    .where(
      and(
        eq(campaigns.id, params.campaignId),
        eq(campaigns.userId, params.userId),
        eq(campaigns.status, "compiled"),
      ),
    )
    .returning({ id: campaigns.id });
  return claimed ? "scheduled" : "already_launched";
}

export async function dueScheduledCampaigns(limit = 5): Promise<
  Array<{ id: string; userId: string; approvalDigest: string }>
> {
  const rows = await getDb()
    .select({
      id: campaigns.id,
      userId: campaigns.userId,
      approvalDigest: campaigns.approvalDigest,
    })
    .from(campaigns)
    .where(and(eq(campaigns.status, "scheduled"), lte(campaigns.scheduledAt, new Date())))
    .orderBy(asc(campaigns.scheduledAt), asc(campaigns.id))
    .limit(Math.max(1, Math.min(limit, 10)));

  return rows.flatMap((row) =>
    row.approvalDigest ? [{ ...row, approvalDigest: row.approvalDigest }] : [],
  );
}

export async function failScheduledCampaign(params: {
  campaignId: string;
  message: string;
}): Promise<void> {
  await getDb()
    .update(campaigns)
    .set({ status: "failed", failureMessage: params.message.slice(0, 500) })
    .where(and(eq(campaigns.id, params.campaignId), eq(campaigns.status, "scheduled")));
}

export async function recordCallSubmission(params: {
  campaignId: string;
  callResultId: string;
  execution: SafeCallExecution;
}): Promise<void> {
  const status = executionStatus(params.execution.status);
  const completedAt = TERMINAL.has(status) ? new Date() : null;
  await getDb().transaction(async (tx) => {
    await tx
      .update(callResults)
      .set({
        calleCallId: params.execution.callId,
        status,
        capturedData: params.execution.structuredResult,
        qualified: qualified(params.execution.structuredResult),
        startedAt: new Date(),
        completedAt,
      })
      .where(
        and(
          eq(callResults.id, params.callResultId),
          eq(callResults.campaignId, params.campaignId),
        ),
      );
    await refreshCampaignStatusTx(tx, params.campaignId);
  });
}

export async function recordSubmissionFailure(params: {
  campaignId: string;
  callResultId: string;
  /** The caught error's own message — see processCallDispatchJob in lib/campaigns/dispatch.ts. */
  reason: string;
  /** Defaults to a generic submission error; pass a more specific code when known. */
  code?: string;
}): Promise<void> {
  const failureMessage =
    `${params.reason} — CALL-E did not confirm whether it accepted this call; ` +
    "no automatic retry was attempted.";
  await getDb().transaction(async (tx) => {
    await tx
      .update(callResults)
      .set({
        status: "submission_uncertain",
        failureCode: params.code ?? "submission_error",
        failureMessage: failureMessage.slice(0, 500),
        completedAt: new Date(),
      })
      .where(
        and(
          eq(callResults.id, params.callResultId),
          eq(callResults.campaignId, params.campaignId),
        ),
      );
    await refreshCampaignStatusTx(tx, params.campaignId);
  });
}

export async function recordWebhookEvent(
  event: ParsedWebhookEvent,
): Promise<"processed" | "duplicate"> {
  return getDb().transaction(async (tx) => {
    const [inserted] = await tx
      .insert(processedWebhookEvents)
      .values({ eventId: event.id, eventType: event.type })
      .onConflictDoNothing()
      .returning({ eventId: processedWebhookEvents.eventId });
    if (!inserted) return "duplicate";

    const [updated] = await tx
      .update(callResults)
      .set({
        calleCallId: event.call.id,
        qualified: event.call.qualified,
        capturedData: event.call.capturedData,
        summary: event.call.summary,
        transcript: event.call.transcript,
        status: event.call.status,
        failureCode: event.call.failureCode,
        failureMessage: event.call.failureMessage,
        completedAt: event.call.completedAt,
      })
      .where(
        and(
          eq(callResults.id, event.call.callResultId),
          eq(callResults.campaignId, event.call.campaignId),
          eq(callResults.contactId, event.call.contactId),
          or(isNull(callResults.calleCallId), eq(callResults.calleCallId, event.call.id)),
        ),
      )
      .returning({ id: callResults.id });
    if (!updated) throw new Error("Webhook does not match a known Veyra call run");
    await refreshCampaignStatusTx(tx, event.call.campaignId);
    return "processed";
  });
}
