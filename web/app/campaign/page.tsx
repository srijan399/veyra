import { asc, desc, eq } from 'drizzle-orm';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import CampaignBuilder from '@/components/CampaignBuilder';
import StepHeader from '@/components/StepHeader';
import { callResults, campaigns, contacts, workflows } from '@/lib/db/schema';
import { withRLS } from '@/lib/db/with-rls';
import { getSessionUser } from '@/lib/supabase/auth';
import type {
  CallResult,
  CallStatus,
  CampaignStatus,
  Contact,
} from '@/types/campaign';
import type { Workflow } from '@/types/workflow';

export default async function CampaignPage({
  searchParams,
}: PageProps<'/campaign'>) {
  const user = await getSessionUser();
  if (!user) redirect('/auth/login?next=/campaign');

  const requested = (await searchParams).campaign;
  const loaded = await withRLS(user.id, async (tx) => {
    const base = tx
      .select({
        id: campaigns.id,
        workflowId: campaigns.workflowId,
        name: campaigns.name,
        status: campaigns.status,
        locale: campaigns.locale,
        scheduledAt: campaigns.scheduledAt,
        failureMessage: campaigns.failureMessage,
        compiledRequest: campaigns.compiledRequest,
      })
      .from(campaigns);
    const [campaign] =
      typeof requested === 'string'
        ? await base.where(eq(campaigns.id, requested)).limit(1)
        : await base.orderBy(desc(campaigns.createdAt)).limit(1);
    if (!campaign?.workflowId || !campaign.compiledRequest) return null;
    const workflowId = campaign.workflowId;

    const [workflowRow] = await tx
      .select({ schema: workflows.schema })
      .from(workflows)
      .where(eq(workflows.id, workflowId))
      .limit(1);
    const contactRows = await tx
      .select({
        id: contacts.id,
        name: contacts.name,
        phoneNumber: contacts.phoneNumber,
        metadata: contacts.metadata,
      })
      .from(contacts)
      .where(eq(contacts.campaignId, campaign.id))
      .orderBy(asc(contacts.position), asc(contacts.id));
    if (!workflowRow || !contactRows.length) return null;

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
      .where(eq(callResults.campaignId, campaign.id))
      .orderBy(asc(callResults.createdAt), asc(callResults.id));

    return {
      ...campaign,
      workflowId,
      workflow: workflowRow.schema as Workflow,
      contacts: contactRows.map(
        (contact): Contact => ({
          id: contact.id,
          name: contact.name,
          phoneNumber: contact.phoneNumber,
          ...(contact.metadata && typeof contact.metadata === 'object'
            ? { metadata: contact.metadata as Record<string, string> }
            : {}),
        }),
      ),
      results: resultRows.map(
        (result): CallResult => ({
          id: result.id,
          campaignId: result.campaignId ?? campaign.id,
          contactId: result.contactId ?? '',
          ...(result.calleCallId ? { calleCallId: result.calleCallId } : {}),
          qualified: result.qualified,
          capturedData:
            result.capturedData && typeof result.capturedData === 'object'
              ? (result.capturedData as Record<string, unknown>)
              : null,
          summary: result.summary,
          ...(result.transcript ? { transcript: result.transcript } : {}),
          status: result.status as CallStatus,
          failureCode: result.failureCode,
          failureMessage: result.failureMessage,
          ...(result.createdAt
            ? { createdAt: result.createdAt.toISOString() }
            : {}),
          ...(result.startedAt
            ? { startedAt: result.startedAt.toISOString() }
            : {}),
          ...(result.completedAt
            ? { completedAt: result.completedAt.toISOString() }
            : {}),
        }),
      ),
    };
  });

  if (!loaded) {
    if (typeof requested === 'string') notFound();
    return (
      <div className="flex min-h-screen flex-col bg-ink">
        <StepHeader current="campaign" />
        <main className="mx-auto flex w-full max-w-210 flex-1 flex-col items-start px-12 py-20">
          <div className="text-[10.5px] uppercase tracking-[.14em] text-bone/45">
            No compiled campaign
          </div>
          <h1 className="mt-3 text-4xl font-extrabold text-bone">
            Compile a workflow first.
          </h1>
          <p className="mt-4 max-w-lg text-sm leading-6 text-bone/55">
            Phase 2 creates a durable campaign from the exact workflow currently
            open in the editor. Choose a workflow, review any edits, then select
            Compile to Call.
          </p>
          <Link
            href="/workflow"
            className="mt-6 bg-flame px-5 py-3 text-sm font-extrabold text-ink no-underline"
          >
            Choose a workflow
          </Link>
        </main>
      </div>
    );
  }

  const initialCsv = loaded.contacts
    .map((item) => `${item.name}, ${item.phoneNumber}`)
    .join('\n');

  return (
    <div className="flex min-h-screen flex-col bg-ink">
      <StepHeader current="campaign" />
      <CampaignBuilder
        campaignId={loaded.id}
        workflowId={loaded.workflowId}
        initialName={loaded.name}
        initialLocale={loaded.locale === 'en-US' ? 'en-US' : 'en-IN'}
        initialScheduledAt={loaded.scheduledAt?.toISOString() ?? null}
        initialContacts={loaded.contacts}
        initialCsv={initialCsv}
        stepCount={loaded.workflow.nodes.length}
        initialStatus={loaded.status as CampaignStatus}
        initialResults={loaded.results}
        schedulingEnabled={process.env.CAMPAIGN_SCHEDULING_ENABLED === 'true'}
        initialFailureMessage={loaded.failureMessage}
      />
    </div>
  );
}
