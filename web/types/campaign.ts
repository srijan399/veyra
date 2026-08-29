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
  result_schema: Record<string, unknown>;
  recipient_result_schema?: Record<string, unknown>;
  metadata: { campaignId: string; contactId: string };
  webhook_url: string;
}

export type CampaignStatus =
  | "draft"
  | "compiled"
  | "launching"
  | "launched"
  | "completed"
  | "failed";

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
  | "submitting"
  | "queued"
  | "in_progress"
  | "completed"
  | "failed"
  | "canceled"
  | "no_answer"
  | "result_validation_failed"
  | "submission_uncertain";

export interface CallResult {
  id: string;
  campaignId: string;
  contactId: string;
  /** The CALL-E call id, once the call is created. */
  calleCallId?: string;
  qualified: boolean | null;
  /** Null when CALL-E returned structured_result: null — a normal outcome. */
  capturedData: Record<string, unknown> | null;
  summary?: string | null;
  transcript?: string;
  status: CallStatus;
  failureCode?: string | null;
  failureMessage?: string | null;
  createdAt?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface CampaignRecipientPreview {
  contactId: string;
  name: string;
  maskedPhone: string;
  task: string;
  resultSchema: Record<string, unknown>;
}

export interface CampaignLaunchPreview {
  campaignId: string;
  mode: "fake" | "live";
  callCount: number;
  recipients: CampaignRecipientPreview[];
  sideEffects: string[];
  recipientAuthorizationRequired: boolean;
  approvalDigest: string;
}

/** A campaign plus the workflow it runs, as the campaign builder needs it. */
export interface CampaignDraft {
  workflow: Workflow;
  name: string;
  contacts: Contact[];
}
