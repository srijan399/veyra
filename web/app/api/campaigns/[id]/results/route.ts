import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { callResults, campaigns } from "@/lib/db/schema";
import { withRLS } from "@/lib/db/with-rls";
import { requireUser } from "@/lib/supabase/auth";
import type { CallResult, CallStatus, CampaignStatus } from "@/types/campaign";

export const runtime = "nodejs";
type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Params) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { id } = await context.params;

  const loaded = await withRLS(auth.user.id, async (tx) => {
    const [campaign] = await tx
      .select({
        status: campaigns.status,
        scheduledAt: campaigns.scheduledAt,
        failureMessage: campaigns.failureMessage,
      })
      .from(campaigns)
      .where(eq(campaigns.id, id))
      .limit(1);
    if (!campaign) return null;
    const rows = await tx
      .select({
        id: callResults.id,
        campaignId: callResults.campaignId,
        contactId: callResults.contactId,
        calleCallId: callResults.calleCallId,
        qualified: callResults.qualified,
        capturedData: callResults.capturedData,
        summary: callResults.summary,
        transcript: callResults.transcript,
        status: callResults.status,
        failureCode: callResults.failureCode,
        failureMessage: callResults.failureMessage,
        createdAt: callResults.createdAt,
        startedAt: callResults.startedAt,
        completedAt: callResults.completedAt,
      })
      .from(callResults)
      .where(eq(callResults.campaignId, id))
      .orderBy(asc(callResults.createdAt), asc(callResults.id));

    return {
      status: campaign.status as CampaignStatus,
      scheduledAt: campaign.scheduledAt?.toISOString() ?? null,
      failureMessage: campaign.failureMessage,
      results: rows.map(
        (row): CallResult => ({
          id: row.id,
          campaignId: row.campaignId ?? id,
          contactId: row.contactId ?? "",
          ...(row.calleCallId ? { calleCallId: row.calleCallId } : {}),
          qualified: row.qualified,
          capturedData:
            row.capturedData && typeof row.capturedData === "object"
              ? (row.capturedData as Record<string, unknown>)
              : null,
          summary: row.summary,
          ...(row.transcript ? { transcript: row.transcript } : {}),
          status: row.status as CallStatus,
          failureCode: row.failureCode,
          failureMessage: row.failureMessage,
          ...(row.createdAt ? { createdAt: row.createdAt.toISOString() } : {}),
          ...(row.startedAt ? { startedAt: row.startedAt.toISOString() } : {}),
          ...(row.completedAt ? { completedAt: row.completedAt.toISOString() } : {}),
        }),
      ),
    };
  });

  if (!loaded) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  return NextResponse.json(loaded);
}
