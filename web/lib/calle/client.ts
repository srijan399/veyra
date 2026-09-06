import type { JsonObject, SafeCallDraft, SafeCallPreview } from "./safety";
import type { CallMode } from "./safety";
import { maskPhone } from "./safety";
import { CallConfigurationError } from "./client-error";
import { liveCalleWebhookUrl } from "./webhook-url";

export { CallConfigurationError } from "./client-error";

const OFFICIAL_CALLE_BASE_URL = "https://api.heycall-e.com";

export interface SafeCallExecution {
  mode: CallMode;
  callId: string;
  status: string;
  structuredResult: JsonObject | null;
  idempotencyKey: string;
  externalSideEffect: boolean;
}

export function getCallMode(): CallMode {
  const configured = (process.env.CALL_MODE ?? "fake").trim().toLowerCase();
  if (configured === "fake" || configured === "live") return configured;
  throw new CallConfigurationError('CALL_MODE must be either "fake" or "live"');
}

function liveConfig(): { apiKey: string; baseUrl: string } {
  if (process.env.CALLE_LIVE_ENABLED !== "true") {
    throw new CallConfigurationError("Live calling is disabled by CALLE_LIVE_ENABLED");
  }

  const apiKey = process.env.CALLE_API_KEY;
  if (!apiKey) throw new CallConfigurationError("CALLE_API_KEY is required in live mode");

  const configuredBaseUrl = (process.env.CALLE_BASE_URL ?? OFFICIAL_CALLE_BASE_URL).replace(
    /\/$/,
    "",
  );
  if (configuredBaseUrl !== OFFICIAL_CALLE_BASE_URL) {
    throw new CallConfigurationError("Live credentials may only be sent to the official CALL-E origin");
  }

  return { apiKey, baseUrl: configuredBaseUrl };
}

export function assertApprovedCallReady(
  _draft: SafeCallDraft,
  preview: SafeCallPreview,
): void {
  const currentMode = getCallMode();
  if (currentMode !== preview.mode) {
    throw new CallConfigurationError("CALL_MODE changed after preview; generate a new preview");
  }
  if (currentMode === "live") {
    liveConfig();
    liveCalleWebhookUrl();
  }
}

function fakeValue(schema: unknown): unknown {
  if (typeof schema !== "object" || schema === null || Array.isArray(schema)) return null;
  const value = schema as Record<string, unknown>;
  if (Array.isArray(value.enum) && value.enum.length) return value.enum[0];

  switch (value.type) {
    case "object": {
      const properties =
        typeof value.properties === "object" && value.properties !== null
          ? (value.properties as Record<string, unknown>)
          : {};
      return Object.fromEntries(Object.entries(properties).map(([key, item]) => [key, fakeValue(item)]));
    }
    case "array":
      return [];
    case "boolean":
      return false;
    case "integer":
    case "number":
      return 0;
    case "string":
      return "sample";
    default:
      return null;
  }
}

/** Exactly one create call, with no SDK or application retry path. */
export async function executeApprovedCall(
  draft: SafeCallDraft,
  preview: SafeCallPreview,
): Promise<SafeCallExecution> {
  assertApprovedCallReady(draft, preview);
  const currentMode = preview.mode;

  if (currentMode === "fake") {
    const structuredResult = fakeValue(draft.resultSchema);
    const execution: SafeCallExecution = {
      mode: "fake",
      callId: `fake_${preview.approvalDigest.slice(0, 16)}`,
      status: "completed",
      structuredResult:
        typeof structuredResult === "object" && structuredResult !== null && !Array.isArray(structuredResult)
          ? (structuredResult as JsonObject)
          : null,
      idempotencyKey: preview.idempotencyKey,
      externalSideEffect: false,
    };
    console.log(
      `[calle] fake mode — no request sent. phone=${maskPhone(draft.phone)} locale=${draft.locale} ` +
        `callId=${execution.callId} status=${execution.status}`,
    );
    return execution;
  }

  const config = liveConfig();
  const hasWebhook = typeof draft.metadata?.veyraCallResultId === "string";
  const requestBody = {
    task: draft.task,
    recipient: { phone: draft.phone, locale: draft.locale },
    resultSchema: draft.resultSchema,
    ...(hasWebhook ? { webhookUrl: liveCalleWebhookUrl() } : {}),
    metadata: {
      ...(draft.metadata ?? {}),
      veyraApprovalDigest: preview.approvalDigest,
      veyraCallMode: "live",
    },
  };
  console.log(
    `[calle] → calls.create phone=${maskPhone(draft.phone)} locale=${draft.locale} ` +
      `idempotencyKey=${preview.idempotencyKey} taskChars=${draft.task.length} hasWebhook=${hasWebhook}`,
  );
  console.log(`[calle] → task text:\n${draft.task}`);
  console.log(`[calle] → result schema: ${JSON.stringify(draft.resultSchema)}`);

  // Keep fake mode entirely credential-free and side-effect-free. The official SDK is
  // not loaded until every live gate above has passed.
  const { CalleClient } = await import("@call-e/calle");
  const client = new CalleClient({ apiKey: config.apiKey, baseUrl: config.baseUrl });
  const call = await client.calls.create(requestBody, { idempotencyKey: preview.idempotencyKey });

  console.log(
    `[calle] ← calls.create responded callId=${call.id} status=${call.status} ` +
      `taskCompleted=${call.taskCompleted ?? "n/a"} confidence=${call.completionConfidence?.label ?? "n/a"} ` +
      `structuredResult=${call.structuredResult ? "present" : "null"} ` +
      `failureCode=${call.failureCode ?? "none"} failureMessage=${call.failureMessage ?? "none"}`,
  );
  if (call.structuredResult) {
    console.log(`[calle] ← structured result: ${JSON.stringify(call.structuredResult)}`);
  }
  if (call.summary) {
    console.log(`[calle] ← summary: ${call.summary}`);
  }

  return {
    mode: "live",
    callId: call.id,
    status: call.status,
    structuredResult: call.structuredResult,
    idempotencyKey: preview.idempotencyKey,
    externalSideEffect: true,
  };
}
