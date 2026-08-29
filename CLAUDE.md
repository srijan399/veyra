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
- Gemini API (Google) for natural language prompt to workflow schema generation, called
  from a standalone Python/FastAPI service (`engine/`), not from a Next.js API route
  directly — see `engine/README.md`
- Supabase (Postgres + Auth) for storing workflows, campaigns, contacts, and call
  results, and for email/password auth
- Drizzle ORM (`web/lib/db/`) for schema, migrations, and every data-layer query — see
  the Authentication and Data Scoping section below for the RLS caveat this comes with
- `@call-e/calle` SDK for placing calls and receiving structured results
- Vercel for deployment

Do not introduce additional frameworks or major dependencies without checking with the
team first, we are optimizing for shipping speed, not architectural purity.

## Repository Structure

- `web/app/` - Next.js pages and API routes
  - `web/app/api/workflows/generate/route.ts` - `requireUser()`, then calls the engine
    (`web/lib/engine-client.ts` -> `engine/`, Gemini) for prompt to workflow schema, persists
    the result to `public.workflows`
  - `web/app/api/workflows/[id]/compile/route.ts` - workflow schema to a Calls API task +
    result schema
  - `web/app/api/campaigns/` - campaign creation and launch
  - `web/app/api/calle/` - CALL-E SDK/API wrapper functions, all CALL-E calls go through here
- `web/components/` - React components
  - `web/components/WorkflowGraph.tsx` - React Flow rendering and editing of a workflow schema
  - `web/components/NodeTable.tsx` - tabular summary of workflow nodes
  - `web/components/CampaignBuilder.tsx` - contact upload and campaign launch UI
  - `web/components/ResultsDashboard.tsx` - campaign results view
- `web/types/workflow.ts` - the shared workflow schema definition, this is the contract between
  the generator, the visualizer, and the CALL-E compiler. Do not change this without
  updating all three consumers.
- `web/lib/engine-client.ts` - server-side wrapper for the workflow engine's HTTP API
  (generate, edit, validate, compile); no other file should call the engine directly
- `web/lib/validation.ts` - zod validation of generated workflows, plus enforcement of
  CALL-E's supported JSON Schema subset (also ported to Python in
  `engine/app/calle_schema.py`, since the compiler now lives there)
- `web/lib/supabase/` - Supabase Auth only now: `client.ts` (browser), `server.ts`
  (server components and route handlers), `middleware.ts` (session refresh plus route
  protection), `auth.ts` (`getSessionUser`, `requireUser`). None of these run data
  queries any more — see `web/lib/db/` below.
- `web/lib/db/schema.ts` - Drizzle table definitions, the source of truth for schema
  (mirrors `web/supabase/schema.sql`, which is now superseded, kept only for history)
- `web/lib/db/client.ts` - the raw Postgres connection (`DATABASE_URL`). Never query
  through this directly from a route.
- `web/lib/db/with-rls.ts` - `withRLS(userId, fn)`: every data query in a route must go
  through this. See "Authentication and Data Scoping" below for why.
- `web/drizzle/` - migrations. `pnpm db:generate` after changing `schema.ts`,
  `pnpm db:migrate` to apply. `0001_rls_policies.sql` (hand-written, not generated) is
  the RLS policies / profile trigger / grants — the table-structure part of a schema
  change is generated, the RLS part is edited by hand in that file.
- `web/supabase/schema.sql` - superseded by the above. Kept only as a historical
  single-file reference of the same end state; do not run it against a database that has
  already run the Drizzle migrations.
- `web/lib/calle-client.ts` - CALL-E SDK client wrapper
- `engine/` - standalone Python/FastAPI service owning workflow generation (Gemini),
  natural-language editing, graph validation, and compilation (workflow schema to a
  Calls API task + result schema). Stateless and CALL-E-credential-free; see
  `engine/README.md`. `engine/app/models/workflow.py` mirrors `web/types/workflow.ts` and
  must be updated alongside it, same as the three TypeScript consumers below.

## Workflow Schema (web/types/workflow.ts)

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

Any change to this schema must be reflected in the generator prompt
(`engine/app/generator.py`), the Pydantic mirror (`engine/app/models/workflow.py`), the
React Flow renderer (`web/components/WorkflowGraph.tsx`), and the CALL-E compiler
(`engine/app/compiler.py`). Treat this file as the source of truth.

## Common Commands

All of these run from `web/`, not the repo root:

- `npm run dev` - start local dev server
- `npm run build` - production build
- `npm run lint` - lint check
- `npm run test` - run tests (if/when added)

Engine (`engine/`) has its own commands, see `engine/README.md`: `uvicorn main:app
--reload --port 8008` to run it, `pytest` to test it. It must be running (or `ENGINE_URL`
pointed at a deployed instance) for `/api/workflows/generate` and
`/api/workflows/[id]/edit` to work.

## Authentication and Data Scoping

Email and password auth via Supabase Auth. Deliberately minimal: no password reset, no
OAuth, no MFA, no email verification. Full detail in TECHNICAL_ARCH.md, Authentication
section. What matters when writing code:

- **Every workflow and campaign route requires an authenticated user.** Pages under
  `/workflow`, `/campaign` and `/profile` are guarded by `web/proxy.ts` (Next.js 16's rename of
  middleware). API routes under `web/app/api/workflows/` and `web/app/api/campaigns/` must open
  with `requireUser()` from `web/lib/supabase/auth.ts`:

  ```ts
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { user } = auth;
  ```

  This step hasn't changed — `requireUser()` still verifies the session through Supabase
  Auth. What changed is what happens after: `auth.supabase` is no longer where data
  queries go, see the next point.

  The only route exempt is the CALL-E webhook, which has no user session.

- **Every data query goes through `withRLS(user.id, fn)` from `web/lib/db/with-rls.ts` —
  never query `web/lib/db/client.ts`'s connection directly.** This is the one thing to
  get right about the Drizzle setup. A direct Postgres connection has no idea which user
  is asking; by default it either bypasses RLS entirely (the connecting role owns the
  tables) or has no grants at all. `withRLS()` closes that gap by impersonating the
  request's user inside one transaction — `set_config('request.jwt.claims', ...)` plus
  `set local role authenticated` — so the exact same RLS policies that used to run under
  PostgREST still run, just through Drizzle instead:

  ```ts
  const rows = await withRLS(user.id, (tx) =>
    tx.select().from(workflows).where(eq(workflows.id, id)),
  );
  ```

  **`user_id` scoping is still enforced by RLS in Postgres, not in application code** —
  that did not change when the query builder did. Adding `.where(eq(workflows.userId,
  user.id))` as defense in depth is fine, but do not mistake it for the thing doing the
  work; the actual enforcement is the RLS policy, which only applies at all because of
  `withRLS()`. A route that queries through `getDb()`/`client.ts` directly instead of
  `withRLS()` is a cross-tenant data leak with no error message — nothing fails, it just
  returns everyone's rows (or none, depending on the connecting role's own grants).

- **Inserts must set `user_id`/`userId: user.id` explicitly.** The RLS insert policy checks
  that column, it does not populate it, so an insert that omits it fails the `with check`
  (verified: attempting to insert a row with someone else's `user_id` while impersonating a
  different user raises, it doesn't silently write under the wrong owner).

- **Any new table that stores user-owned data follows the same pattern, in the same
  change**: a `user_id uuid not null references auth.users(id) on delete cascade` column (or
  ownership derived from a parent table that has one) in `web/lib/db/schema.ts`, RLS enabled
  and select/insert/update/delete policies written by hand in a new
  `web/drizzle/000N_*.sql` migration (see `0001_rls_policies.sql` for the pattern — this is
  not something `drizzle-kit generate` produces for you). A table added without policies is
  reachable through `withRLS()` — and through the Data API, if it's ever exposed there — by
  anyone. Do not defer this — an unpoliced table looks identical to a policed one until
  someone else's data shows up on screen.

- **Never use the service role key, and never call `getDb()` without `withRLS()`, to work
  around RLS.** Both bypass row security entirely and turn the route into a cross-tenant
  data leak. The service role's one legitimate use is the CALL-E webhook; there is no
  legitimate direct use of `getDb()` outside `with-rls.ts` itself.

- **Never put an authorization decision behind a `user_metadata` claim.** It is
  client-editable. That is why `role` defaults to `'business_user'` in the database instead
  of being read from the signup payload.

- `web/lib/db/schema.ts` plus `web/drizzle/*.sql` are the source of truth for tables, the
  profile trigger, and every policy. Apply with `pnpm db:migrate`, not by hand in the SQL
  editor. `web/supabase/schema.sql` is the same end state kept only for historical
  reference — do not run it against a database that has already run the migrations.

- Client components read the current user via `useUser()` from `web/components/UserProvider.tsx`
  (resolved server side in the root layout, so no fetch and no logged-out flash). Server
  components use `getSessionUser()` from `web/lib/supabase/auth.ts`. Neither of these needs
  `withRLS()` — they never touch `public.*` tables, only Supabase Auth's own session/user.

## CALL-E Integration Details

All CALL-E SDK/API calls are wrapped in `web/lib/calle-client.ts` and `web/app/api/calle/`, no
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

Instantiated server side only, inside `web/lib/calle-client.ts`:

```ts
const client = new CalleClient({ apiKey: process.env.CALLE_API_KEY! });
```

Never import this client, or `CALLE_API_KEY`, into client-side code.

### Two entry points into CALL-E

1. **Compilation**: the workflow graph is flattened into a Calls API request by
   `engine/app/compiler.py` (not a Next.js file — see engine/README.md), called from
   `web/app/api/workflows/[id]/compile/route.ts` (not yet built) via
   `web/lib/engine-client.ts`. Output shape:
   `{ task, result_schema, recipient_result_schema?, metadata, webhook_url }`. CALL-E does
   not execute an external branching graph, it runs one adaptive conversation from a
   single task instruction and extracts structured data at the end of the call.
2. **Execution**: launching a campaign places real calls via
   `web/app/api/campaigns/[id]/launch/route.ts`. Results arrive by webhook at
   `web/app/api/calle/webhook/route.ts`.

### Mandatory rules when touching web/lib/calle-client.ts or engine/app/compiler.py

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
  are rejected server side. Validate in `web/lib/validation.ts` before sending.
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

Copy `web/.env.example` to `web/.env.local` and fill it in. Never commit actual values:

- `ENGINE_URL` - base URL of the `engine/` FastAPI service, defaults to
  `http://localhost:8008` when unset
- `ENGINE_SHARED_SECRET` - optional, only needed if the engine has its own
  `ENGINE_SHARED_SECRET` set (see `engine/.env.example`)
- `CALLE_API_KEY` - CALL-E credentials
- `CALLE_BASE_URL` - optional CALL-E API base URL override, defaults to
  `https://api.heycall-e.com`
- `DATABASE_URL` - direct Postgres connection string for Drizzle (`web/lib/db/`), the
  Supabase `postgres` role specifically, pooler connection string in transaction mode.
  Not the same thing as `NEXT_PUBLIC_SUPABASE_URL` below. See `web/lib/db/with-rls.ts`
  for why it must be the `postgres` role.
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase server side key. Bypasses RLS, webhook route only
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` - Supabase browser side key. Note PUBLISHABLE, not
  ANON, this is what `web/lib/supabase/*.ts` actually read
- `APP_URL` - public base URL of this app, used to build the `webhook_url` sent on every
  call. Local development needs a tunnel for CALL-E to reach the webhook.
- `CAMPAIGN_SCHEDULING_ENABLED` - optional fail-closed switch for durable scheduled
  dispatch. Leave `false` for immediate-only launch, especially on Vercel Hobby.
- `CRON_SECRET` - at least 16 random characters, sent as a Bearer token to the server-only
  `/api/cron/campaigns` worker by the configured scheduler.

`engine/` has its own `.env`/`engine/.env.example` (`GEMINI_API_KEY`, `GEMINI_MODEL`,
`ENGINE_SHARED_SECRET`) — it is a separate service and does not read this app's
`web/.env.local`.

If you add a variable, add it to `web/.env.example` in the same commit, otherwise your
teammate's next clone is missing it.

## Coding Conventions

- TypeScript throughout, no implicit any
- Prefer server side (API routes) for anything touching the engine, CALL-E, or Supabase
  service role key, never expose these client side
- Keep components small and focused, one responsibility per component
- Use the shared `web/types/workflow.ts` types everywhere a workflow is passed around, do not
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
