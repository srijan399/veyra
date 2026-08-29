import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { CallHttpError, readCallJson } from "@/lib/calle/http";
import { SafeCallInputError } from "@/lib/calle/safety";
import {
  calleWebhookUrl,
  CampaignInputError,
  createSafeDraftFromCompiled,
  parseCampaignCompileInput,
} from "@/lib/campaigns/compile";
import { campaigns, contacts, workflows } from "@/lib/db/schema";
import { withRLS } from "@/lib/db/with-rls";
import { compileWorkflow, EngineError } from "@/lib/engine-client";
import { requireUser } from "@/lib/supabase/auth";
import type { Contact } from "@/types/campaign";
import type { Workflow } from "@/types/workflow";

export const runtime = "nodejs";
type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Params) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { id } = await context.params;

  try {
    const input = parseCampaignCompileInput(await readCallJson(request));
    const loaded = await withRLS(auth.user.id, async (tx) => {
      const [campaign] = await tx
        .select({ workflowId: campaigns.workflowId })
        .from(campaigns)
        .where(eq(campaigns.id, id))
        .limit(1);
      if (!campaign?.workflowId) return null;

      const [workflowRow] = await tx
        .select({ schema: workflows.schema })
        .from(workflows)
        .where(eq(workflows.id, campaign.workflowId))
        .limit(1);
      const [contactRow] = await tx
        .select({ id: contacts.id })
        .from(contacts)
        .where(eq(contacts.campaignId, id))
        .limit(1);
      if (!workflowRow || !contactRow) return null;
      return {
        workflowId: campaign.workflowId,
        workflow: workflowRow.schema as Workflow,
        contactId: contactRow.id,
      };
    });
    if (!loaded) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    const contact: Contact = { id: loaded.contactId, ...input.contact };
    const compiled = await compileWorkflow({
      workflow: loaded.workflow,
      campaignId: id,
      contact,
      webhookUrl: calleWebhookUrl(),
    });
    const draft = createSafeDraftFromCompiled(compiled, input.name, contact);
    const compiledAt = new Date();

    await withRLS(auth.user.id, async (tx) => {
      const [updatedCampaign] = await tx
        .update(campaigns)
        .set({ name: input.name, compiledRequest: compiled, status: "compiled" })
        .where(eq(campaigns.id, id))
        .returning({ id: campaigns.id });
      const [updatedContact] = await tx
        .update(contacts)
        .set({
          name: contact.name,
          phoneNumber: contact.phoneNumber,
          metadata: contact.metadata ?? null,
        })
        .where(eq(contacts.id, contact.id))
        .returning({ id: contacts.id });
      if (!updatedCampaign || !updatedContact) {
        throw new Error("Campaign disappeared while compiling");
      }
    });

    return NextResponse.json({
      campaignId: id,
      workflowId: loaded.workflowId,
      contact,
      draft,
      compiledAt: compiledAt.toISOString(),
    });
  } catch (error) {
    if (error instanceof CallHttpError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof CampaignInputError || error instanceof SafeCallInputError) {
      return NextResponse.json(
        { error: "Campaign could not be compiled", issues: error.issues },
        { status: 400 },
      );
    }
    if (error instanceof EngineError) {
      return NextResponse.json(
        { error: "Campaign compilation failed", detail: error.message },
        { status: error.status === 422 ? 422 : error.status === 503 ? 503 : 502 },
      );
    }
    return NextResponse.json({ error: "Compiled campaign could not be saved" }, { status: 500 });
  }
}
