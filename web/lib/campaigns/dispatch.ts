import "server-only";

import { assertApprovedCallReady, executeApprovedCall } from "@/lib/calle/client";
import type { PreparedCampaignLaunch } from "@/lib/campaigns/lifecycle";
import {
  recordCallSubmission,
  recordSubmissionFailure,
  reserveCampaignRuns,
} from "@/lib/db/call-lifecycle";

export interface CampaignDispatchRun {
  id: string;
  contactId: string;
  status: string;
  calleCallId: string | null;
  capturedData: Record<string, unknown> | null;
  qualified: boolean | null;
}

export async function dispatchPreparedCampaign(params: {
  userId: string;
  campaignId: string;
  prepared: PreparedCampaignLaunch;
  fromStatus?: "compiled" | "scheduled";
}): Promise<{ status: "submitted" | "already_launched"; runs: CampaignDispatchRun[] }> {
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
    return { status: "already_launched", runs: [] };
  }

  const runs: CampaignDispatchRun[] = [];
  for (const call of params.prepared.calls) {
    try {
      const execution = await executeApprovedCall(call.draft, call.preview);
      await recordCallSubmission({
        campaignId: params.campaignId,
        callResultId: call.callResultId,
        execution,
      });
      runs.push({
        id: call.callResultId,
        contactId: call.contact.id,
        status: execution.status,
        calleCallId: execution.callId,
        capturedData: execution.structuredResult,
        qualified:
          typeof execution.structuredResult?.qualified === "boolean"
            ? execution.structuredResult.qualified
            : null,
      });
    } catch {
      await recordSubmissionFailure({
        campaignId: params.campaignId,
        callResultId: call.callResultId,
      });
      runs.push({
        id: call.callResultId,
        contactId: call.contact.id,
        status: "submission_uncertain",
        calleCallId: null,
        capturedData: null,
        qualified: null,
      });
    }
  }

  return { status: "submitted", runs };
}
