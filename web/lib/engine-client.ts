/**
 * Server-side wrapper around Veyra's workflow-authoring engine (engine/, FastAPI,
 * separate from this app — see engine/README.md). All generation, NL-editing,
 * validation and compilation of a Workflow goes through here; no other file should
 * `fetch()` the engine directly, same rule as lib/calle-client.ts for CALL-E.
 *
 * The engine is stateless — it never persists a Workflow — so every call here is a pure
 * request/response; whoever calls this module (the API routes under app/api/workflows/)
 * is responsible for saving the result to Supabase.
 */

import type { Workflow } from "@/types/workflow";
import type { CalleCallRequest, CampaignLocale, Contact } from "@/types/campaign";

const ENGINE_URL = process.env.ENGINE_URL ?? "http://localhost:8008";
const ENGINE_SHARED_SECRET = process.env.ENGINE_SHARED_SECRET;

export class EngineError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "EngineError";
  }
}

/**
 * FastAPI wraps every HTTPException as `{"detail": ...}` — a string for most engine
 * errors (CalleSchemaError, UnsupportedCallFeatureError, generation/edit failures), a
 * list of pydantic error objects for a malformed request body, or `{message, errors}`
 * for a graph-validation failure. Without unwrapping this, EngineError.message was the
 * raw JSON text, which routes then re-embedded as a `detail` field in their own JSON
 * response — a JSON string inside JSON, unreadable in the UI. This turns any of those
 * shapes into one plain, displayable string; unrecognized shapes fall back to the raw
 * text rather than swallowing information.
 */
function engineErrorMessage(text: string, fallback: string): string {
  if (!text) return fallback;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return text;
  }
  if (typeof parsed !== "object" || parsed === null) return text;
  const detail = (parsed as Record<string, unknown>).detail;

  if (typeof detail === "string") return detail;

  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) =>
        typeof item === "object" && item !== null && typeof (item as { msg?: unknown }).msg === "string"
          ? (item as { msg: string }).msg
          : null,
      )
      .filter((message): message is string => message !== null);
    if (messages.length) return messages.join("; ");
  }

  if (typeof detail === "object" && detail !== null) {
    const { message, errors } = detail as { message?: unknown; errors?: unknown };
    const summary = typeof message === "string" ? message : fallback;
    const issues = Array.isArray(errors)
      ? errors.filter((error): error is string => typeof error === "string")
      : [];
    return issues.length ? `${summary}: ${issues.join("; ")}` : summary;
  }

  return text;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${ENGINE_URL}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(ENGINE_SHARED_SECRET ? { authorization: `Bearer ${ENGINE_SHARED_SECRET}` } : {}),
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new EngineError(503, `Could not reach the workflow engine at ${ENGINE_URL}`);
  }

  const text = await response.text();
  if (!response.ok) {
    throw new EngineError(response.status, engineErrorMessage(text, response.statusText));
  }
  return text ? (JSON.parse(text) as T) : (undefined as T);
}

export interface EngineWorkflowResult {
  workflow: Workflow;
  errors: string[];
  warnings: string[];
}

export interface EngineValidateResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/** POST /workflows/generate — a new Workflow from a natural-language prompt. */
export function generateWorkflow(prompt: string): Promise<EngineWorkflowResult> {
  return post<EngineWorkflowResult>("/workflows/generate", { prompt });
}

/** POST /workflows/edit — the full updated Workflow after a natural-language edit. */
export function editWorkflow(
  workflow: Workflow,
  instruction: string,
): Promise<EngineWorkflowResult> {
  return post<EngineWorkflowResult>("/workflows/edit", { workflow, instruction });
}

/** POST /workflows/validate — structural + graph checks, no Claude call. */
export function validateWorkflow(workflow: Workflow): Promise<EngineValidateResult> {
  return post<EngineValidateResult>("/workflows/validate", { workflow });
}

/** POST /workflows/compile — flattens the graph into a CALL-E Calls API request. */
export function compileWorkflow(params: {
  workflow: Workflow;
  campaignId: string;
  contact: Contact;
  webhookUrl: string;
  /** Steers the task's language/register — see engine/app/compiler.py. Defaults to en-IN. */
  locale?: CampaignLocale;
}): Promise<CalleCallRequest> {
  return post<CalleCallRequest>("/workflows/compile", {
    workflow: params.workflow,
    campaign_id: params.campaignId,
    contact: params.contact,
    webhook_url: params.webhookUrl,
    ...(params.locale ? { locale: params.locale } : {}),
  });
}
