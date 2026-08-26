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
import type { CalleCallRequest, Contact } from "@/types/campaign";

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
    throw new EngineError(response.status, text || response.statusText);
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
}): Promise<CalleCallRequest> {
  return post<CalleCallRequest>("/workflows/compile", {
    workflow: params.workflow,
    campaign_id: params.campaignId,
    contact: params.contact,
    webhook_url: params.webhookUrl,
  });
}
