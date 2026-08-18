# Veyra

Workflow generation and orchestration layer on top of CALL-E. Users describe an outbound
calling process in natural language, Veyra generates a structured, editable conversation
workflow, compiles it into a Calls API task and result schema, and launches real calls
through CALL-E, returning structured results.

## Project Context

Two person hackathon team building for the CALL-E hackathon (Your Code Is Calling).
Priority is a working end to end demo: prompt in, editable workflow generated, compiled
into a Calls API request, real call placed, structured result returned. Prefer shipping a
thin working slice over a polished but incomplete pipeline.

Demo vertical: wealth management lead qualification (primary). Secondary vertical
(education or insurance) used to prove the platform is horizontal, not a one off bot.

## Tech Stack

- Next.js (TypeScript), single app for frontend and backend (API routes)
- Tailwind CSS for styling
- React Flow for the interactive, editable workflow graph
- Claude API (Anthropic) for natural language prompt to workflow schema generation
- Supabase (Postgres) for storing workflows, campaigns, contacts, and call results
- `@call-e/calle` SDK for placing calls and receiving structured results
- Vercel for deployment

Do not introduce additional frameworks or major dependencies without checking with the
team first, we are optimizing for shipping speed, not architectural purity.

## Repository Structure

- `app/` - Next.js pages and API routes
  - `app/api/workflows/generate/route.ts` - prompt to workflow schema (Claude API)
  - `app/api/workflows/[id]/compile/route.ts` - workflow schema to a Calls API task +
    result schema
  - `app/api/campaigns/` - campaign creation and launch
  - `app/api/calle/` - CALL-E SDK/API wrapper functions, all CALL-E calls go through here
- `components/` - React components
  - `components/WorkflowGraph.tsx` - React Flow rendering and editing of a workflow schema
  - `components/NodeTable.tsx` - tabular summary of workflow nodes
  - `components/CampaignBuilder.tsx` - contact upload and campaign launch UI
  - `components/ResultsDashboard.tsx` - campaign results view
- `types/workflow.ts` - the shared workflow schema definition, this is the contract between
  the generator, the visualizer, and the CALL-E compiler. Do not change this without
  updating all three consumers.
- `lib/generator.ts` - Claude API prompt logic for workflow generation
- `lib/compiler.ts` - workflow schema to Calls API request translation
- `lib/validation.ts` - zod validation of generated workflows, plus enforcement of
  CALL-E's supported JSON Schema subset
- `lib/supabase.ts` - Supabase client setup
- `lib/calle-client.ts` - CALL-E SDK client wrapper

## Workflow Schema (types/workflow.ts)

The core data contract. A workflow consists of:

- `goal`: string, the overall purpose of the workflow
- `nodes`: array of conversation nodes, each with an id, type (`start`, `question`,
  `decision`, `terminal`), the prompt text the agent says (`say`), a purpose label, and
  the fields it captures
- `edges`: array of transitions between nodes, including branch conditions where relevant
  (e.g. qualification outcome, yes/no consent)
- `qualification`: scoring or rule logic that determines the outcome of a call
- `outcomeSchema`: the structured data shape returned after a call completes (e.g.
  qualified boolean, captured fields, next step)

The graph is Veyra's own authoring and editing abstraction. It is **not** sent to CALL-E as
a graph, it is flattened at compile time into a single natural-language `task` string plus
a `result_schema` (see CALL-E Integration Details below).

Any change to this schema must be reflected in the generator prompt (lib/generator.ts),
the React Flow renderer (components/WorkflowGraph.tsx), and the CALL-E compiler
(lib/compiler.ts). Treat this file as the source of truth.

## Common Commands

- `npm run dev` - start local dev server
- `npm run build` - production build
- `npm run lint` - lint check
- `npm run test` - run tests (if/when added)

## CALL-E Integration Details

All CALL-E SDK/API calls are wrapped in `lib/calle-client.ts` and `app/api/calle/`, no
CALL-E credentials or raw client calls should appear directly in frontend code or other
API routes.

### Calls only, never Goals

**Veyra only ever creates Calls (`POST /v1/calls`). It never creates, reads, or manages
Goals.**

A CALL-E Goal is a persisted, reusable voice workflow. Goals can only be authored and
published inside CALL-E's own Chat interface, the Developer API can only list, read, and
run Goals a human already published there. Since Veyra generates a new workflow for every
user prompt, using Goals would require a manual step in CALL-E's UI per generated
workflow, which defeats the point of the product. Use the one-shot Calls API instead.

### Client setup

```
pnpm add @call-e/calle
```

Instantiated server side only, inside `lib/calle-client.ts`:

```ts
const client = new CalleClient({ apiKey: process.env.CALLE_API_KEY! });
```

Never import this client, or `CALLE_API_KEY`, into client-side code.

### Two entry points into CALL-E

1. **Compilation**: the workflow graph is flattened into a Calls API request in
   `app/api/workflows/[id]/compile/route.ts` via `lib/compiler.ts`. Output shape:
   `{ task, result_schema, recipient_result_schema?, metadata, webhook_url }`. CALL-E does
   not execute an external branching graph, it runs one adaptive conversation from a
   single task instruction and extracts structured data at the end of the call.
2. **Execution**: launching a campaign places real calls via
   `app/api/campaigns/[id]/launch/route.ts`. Results arrive by webhook at
   `app/api/calle/webhook/route.ts`.

### Mandatory rules when touching lib/calle-client.ts or lib/compiler.ts

- **One call per contact.** Create a separate Calls API request per contact, with the
  contact's name and relevant metadata interpolated directly into that contact's `task`
  string. Do not use CALL-E's batch `recipients` array for personalized campaigns, it
  sends identical task text to every number and has no per-recipient variable
  substitution.
- **Stable idempotency key.** Every call creation must send an `Idempotency-Key` derived
  from a durable business identifier: `veyra_{campaignId}_{contactId}`. Never a random
  UUID, a random key on retry creates a duplicate real phone call.
- **Metadata on every call.** Always send `metadata: { campaignId, contactId }`. This is
  the only way to correlate an incoming webhook back to the right Supabase rows, CALL-E's
  terminal payload carries no other reference to our internal ids.
- **Constrained result schemas.** `result_schema` and `recipient_result_schema` must use
  only CALL-E's supported JSON Schema subset: `type` of `object`, `string`, `number`,
  `integer`, `boolean`, or `array`, plus `properties`, `required`, `enum`, nested object
  fields, simple `array.items`, `description`, and `additionalProperties: false`.
  `$ref`, `oneOf`, `anyOf`, `allOf`, recursive schemas, and `additionalProperties: true`
  are rejected server side. Validate in `lib/validation.ts` before sending.
- **Webhook handling.** Set `webhook_url` on every call creation. Handle the three
  terminal event types `call.completed`, `call.failed`, and
  `call.result_validation_failed`. There is no webhook signature or secret, validate the
  `CALL-E-Event-Id` header against the event id in the body and otherwise treat the
  endpoint as a public, untrusted-input boundary. Delivery is at-least-once, so store
  processed event ids in Supabase and skip already-processed ids **before** running side
  effects.
- **`structured_result: null` is normal.** It is the documented outcome when CALL-E cannot
  extract a schema-valid result from a call. Handle it gracefully in Supabase writes and
  in the UI, never treat it as a crash.

CALL-E call credits are limited (20 free calls per account). Use mock/stub responses
during UI development and integration testing wherever possible, reserve real CALL-E
calls for testing the compilation layer itself and for the final demo recording. There is
no cancel operation once a call is created, so test with a single contact before
dispatching to a list.

## Environment Variables

Copy `.env.example` to `.env.local` and fill it in. Never commit actual values:

- `ANTHROPIC_API_KEY` - Claude API key for workflow generation
- `CALLE_API_KEY` - CALL-E credentials
- `CALLE_BASE_URL` - optional CALL-E API base URL override, defaults to
  `https://api.heycall-e.com`
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase server side key
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase browser side key
- `APP_URL` - public base URL of this app, used to build the `webhook_url` sent on every
  call. Local development needs a tunnel for CALL-E to reach the webhook.

If you add a variable, add it to `.env.example` in the same commit, otherwise your
teammate's next clone is missing it.

## Coding Conventions

- TypeScript throughout, no implicit any
- Prefer server side (API routes) for anything touching Claude API, CALL-E, or Supabase
  service role key, never expose these client side
- Keep components small and focused, one responsibility per component
- Use the shared `types/workflow.ts` types everywhere a workflow is passed around, do not
  redefine ad hoc shapes

## Repository Etiquette

- Branch naming: `feature/<short-description>` or `fix/<short-description>`
- Commit directly to main is fine for hackathon speed given the two person team, but avoid
  committing broken builds
- If you change the workflow schema, message your teammate before merging, since it
  affects both sides of the pipeline

## What Claude Should Prioritize When Helping

1. A working end to end slice (generate, visualize, compile, execute, show results) over
   a fully featured but incomplete pipeline
2. Keeping the CALL-E integration real and functional, this is the most heavily judged
   technical criterion
3. Clear, demo friendly UI over deep feature completeness, this is being judged on a
   3 minute video
4. Flagging any ambiguity in the workflow schema or CALL-E compilation logic rather than
   guessing silently, since both teammates depend on this contract staying consistent
