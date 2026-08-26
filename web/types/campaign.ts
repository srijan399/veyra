/**
 * Campaign, contact, and call-result shapes. Documented in TECHNICAL_ARCH.md
 * section 3.2 — keep the two in step.
 */

import type { Workflow } from "@/types/workflow";

export interface Contact {
  id: string;
  name: string;
  phoneNumber: string;
  /** Arbitrary extra fields, e.g. { source: "web form" }. Interpolated into the task. */
  metadata?: Record<string, string>;
}

/**
 * The flattened Calls API request produced by lib/compiler.ts. One is built per
 * contact at dispatch time — see TECHNICAL_ARCH.md section 4.3.
 */
export interface CalleCallRequest {
  task: string;
  result_schema: object;
  recipient_result_schema?: object;
  metadata: { campaignId: string; contactId: string };
  webhook_url: string;
}

export type CampaignStatus = "draft" | "compiled" | "launched" | "completed";

export interface Campaign {
  id: string;
  workflowId: string;
  name: string;
  status: CampaignStatus;
  contacts: Contact[];
  /** Set once the workflow has been compiled for this campaign. */
  compiledAt?: string;
  createdAt: string;
  launchedAt?: string;
}

export type CallStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "failed"
  | "no_answer"
  | "result_validation_failed";

export interface CallResult {
  id: string;
  campaignId: string;
  contactId: string;
  /** The CALL-E call id, once the call is created. */
  calleCallId?: string;
  qualified: boolean | null;
  /** Null when CALL-E returned structured_result: null — a normal outcome. */
  capturedData: Record<string, string | number | boolean> | null;
  transcript?: string;
  status: CallStatus;
  failureCode?: string | null;
  completedAt?: string;
}

/** A campaign plus the workflow it runs, as the campaign builder needs it. */
export interface CampaignDraft {
  workflow: Workflow;
  name: string;
  contacts: Contact[];
}
