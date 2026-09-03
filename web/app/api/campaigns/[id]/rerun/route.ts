import { randomUUID } from "crypto";
import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { CallHttpError } from "@/lib/calle/http";
import { SafeCallInputError } from "@/lib/calle/safety";
import { CampaignInputError } from "@/lib/campaigns/compile";
import { compileWorkflowForCampaign } from "@/lib/campaigns/create";
import { campaigns, contacts, workflows } from "@/lib/db/schema";
import { withRLS } from "@/lib/db/with-rls";
import { EngineError } from "@/lib/engine-client";
import { requireUser } from "@/lib/supabase/auth";
import type { CampaignLocale } from "@/types/campaign";
import type { Workflow } from "@/types/workflow";

export const runtime = "nodejs";
type Params = { params: Promise<{ id: string }> };

/**
 * Clones a past campaign into a brand new one on the same workflow, with the same
 * contacts — for a campaign that's launching/launched/scheduled/completed/failed and
 * therefore locked (see CampaignBuilder's `locked` gate), this is the only way to try
 * again: campaigns are never relaunched in place. The new campaign starts at
 * "compiled", same as any freshly created one, so it goes through preview and approval
 * again rather than silently reusing the old approval.
 */
export async function POST(_request: Request, context: Params) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { id } = await context.params;

  try {
    const loaded = await withRLS(auth.user.id, async (tx) => {
      const [campaign] = await tx
        .select({
          name: campaigns.name,
          workflowId: campaigns.workflowId,
          locale: campaigns.locale,
        })
        .from(campaigns)
        .where(eq(campaigns.id, id))
        .limit(1);
      if (!campaign?.workflowId) return null;

      const [workflowRow] = await tx
        .select({ schema: workflows.schema })
        .from(workflows)
        .where(eq(workflows.id, campaign.workflowId))
        .limit(1);
      const contactRows = await tx
        .select({
          name: contacts.name,
          phoneNumber: contacts.phoneNumber,
          metadata: contacts.metadata,
        })
        .from(contacts)
        .where(eq(contacts.campaignId, id))
        .orderBy(asc(contacts.position), asc(contacts.id));
      if (!workflowRow || !contactRows.length) return null;

      return {
        name: campaign.name,
        workflowId: campaign.workflowId,
        locale: campaign.locale,
        workflow: workflowRow.schema as Workflow,
        contacts: contactRows,
      };
    });
    if (!loaded) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

    const campaignId = randomUUID();
    const [firstContact] = loaded.contacts;
    const { compiled, name } = await compileWorkflowForCampaign({
      workflow: loaded.workflow,
      campaignId,
      name: loaded.name,
      seedContact: {
        name: firstContact.name,
        phoneNumber: firstContact.phoneNumber,
        ...(firstContact.metadata && typeof firstContact.metadata === "object"
          ? { metadata: firstContact.metadata as Record<string, string> }
          : {}),
      },
    });

    await withRLS(auth.user.id, async (tx) => {
      await tx.insert(campaigns).values({
        id: campaignId,
        userId: auth.user.id,
        workflowId: loaded.workflowId,
        compiledRequest: compiled,
        name,
        status: "compiled",
        locale: (loaded.locale === "en-US" ? "en-US" : "en-IN") satisfies CampaignLocale,
      });
      await tx.insert(contacts).values(
        loaded.contacts.map((contact, index) => ({
          id: randomUUID(),
          campaignId,
          name: contact.name,
          phoneNumber: contact.phoneNumber,
          metadata: contact.metadata,
          position: index,
        })),
      );
    });

    return NextResponse.json({ campaignId }, { status: 201 });
  } catch (error) {
    if (error instanceof CallHttpError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof CampaignInputError || error instanceof SafeCallInputError) {
      return NextResponse.json(
        { error: "Campaign could not be re-run", issues: error.issues },
        { status: 400 },
      );
    }
    if (error instanceof EngineError) {
      return NextResponse.json(
        { error: "Workflow compilation failed", detail: error.message },
        { status: error.status === 422 ? 422 : error.status === 503 ? 503 : 502 },
      );
    }
    return NextResponse.json({ error: "Campaign could not be re-run" }, { status: 500 });
  }
}
