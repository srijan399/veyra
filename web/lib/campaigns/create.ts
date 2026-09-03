import "server-only";

import { randomUUID } from "crypto";

import { calleWebhookUrl, campaignNameFromGoal, createSafeDraftFromCompiled } from "@/lib/campaigns/compile";
import { compileWorkflow } from "@/lib/engine-client";
import { SAMPLE_CONTACTS } from "@/lib/sample-campaign";
import type { SafeCallDraft } from "@/lib/calle/safety";
import type { CalleCallRequest, Contact } from "@/types/campaign";
import type { Workflow } from "@/types/workflow";

export interface CompiledCampaignDraft {
  compiled: CalleCallRequest;
  name: string;
  contact: Contact;
  draft: SafeCallDraft;
}

/**
 * Compiles a workflow into the exact Calls API request for a single seed contact and
 * builds the validated safe call draft. Shared by both campaign-creation entry points
 * (the workflow editor's "Compile to Call" and the campaigns list's "New Campaign" flow)
 * so the CALL-E-adjacent compile/validation logic exists in exactly one place. Each
 * caller still owns its own database transaction for the campaign/contact insert, since
 * the two entry points differ in what else that transaction needs to do.
 */
export async function compileWorkflowForCampaign(params: {
  workflow: Workflow;
  campaignId: string;
  name?: string;
}): Promise<CompiledCampaignDraft> {
  const sample = SAMPLE_CONTACTS[0];
  const contact: Contact = { id: randomUUID(), name: sample.name, phoneNumber: sample.phoneNumber };

  const compiled = await compileWorkflow({
    workflow: params.workflow,
    campaignId: params.campaignId,
    contact,
    webhookUrl: calleWebhookUrl(),
  });
  const name = params.name?.trim() || campaignNameFromGoal(params.workflow.goal);
  const draft = createSafeDraftFromCompiled(compiled, name, contact, "en-IN");
  return { compiled, name, contact, draft };
}
