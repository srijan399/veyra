import { asc, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";

import ResultsList from "@/components/ResultsList";
import StepHeader from "@/components/StepHeader";
import { callResults, campaigns, contacts } from "@/lib/db/schema";
import { withRLS } from "@/lib/db/with-rls";
import { getSessionUser } from "@/lib/supabase/auth";
import type { CallResult, CallStatus, CampaignStatus, Contact } from "@/types/campaign";

export default async function ResultsByCampaignPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user) redirect(`/auth/login?next=/results/${id}`);

  const loaded = await withRLS(user.id, async (tx) => {
    const [campaign] = await tx
      .select({
        id: campaigns.id,
        name: campaigns.name,
        status: campaigns.status,
        scheduledAt: campaigns.scheduledAt,
        failureMessage: campaigns.failureMessage,
      })
      .from(campaigns)
      .where(eq(campaigns.id, id))
      .limit(1);
    if (!campaign) return null;

    const contactRows = await tx
      .select({ id: contacts.id, name: contacts.name, phoneNumber: contacts.phoneNumber })
      .from(contacts)
      .where(eq(contacts.campaignId, id))
      .orderBy(asc(contacts.position), asc(contacts.id));

    const resultRows = await tx
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
      campaign,
      contacts: contactRows.map(
        (row): Contact => ({ id: row.id, name: row.name, phoneNumber: row.phoneNumber }),
      ),
      results: resultRows.map(
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

  if (!loaded) notFound();

  return (
    <div className="flex min-h-screen flex-col bg-ink">
      <StepHeader current="results" />
      <ResultsList
        campaignId={id}
        campaignName={loaded.campaign.name}
        initialStatus={loaded.campaign.status as CampaignStatus}
        initialScheduledAt={loaded.campaign.scheduledAt?.toISOString() ?? null}
        initialFailureMessage={loaded.campaign.failureMessage}
        contacts={loaded.contacts}
        initialResults={loaded.results}
      />
    </div>
  );
}
