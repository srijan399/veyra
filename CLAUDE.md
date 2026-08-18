# Veyra

Workflow generation and orchestration layer on top of CALL-E. Users describe an outbound
calling process in natural language, Veyra generates a structured, editable conversation
workflow, compiles it into a CALL-E agent configuration, and launches real calls through
CALL-E, returning structured results.

## Project Context

Two person hackathon team building for the CALL-E hackathon (Your Code Is Calling).
Priority is a working end to end demo: prompt in, editable workflow generated, compiled
into CALL-E, real call placed, structured result returned. Prefer shipping a thin working
slice over a polished but incomplete pipeline.

Demo vertical: wealth management lead qualification (primary). Secondary vertical
(education or insurance) used to prove the platform is horizontal, not a one off bot.

## Tech Stack

- Next.js (TypeScript), single app for frontend and backend (API routes)
- Tailwind CSS for styling
- React Flow for the interactive, editable workflow graph
- Claude API (Anthropic) for natural language prompt to workflow schema generation
- Supabase (Postgres) for storing workflows, campaigns, contacts, and call results
- CALL-E SDK/API for compiling and executing voice agent workflows
- Vercel for deployment

Do not introduce additional frameworks or major dependencies without checking with the
team first, we are optimizing for shipping speed, not architectural purity.

## Repository Structure

- `app/` - Next.js pages and API routes
  - `app/api/workflows/generate/route.ts` - prompt to workflow schema (Claude API)
  - `app/api/workflows/[id]/compile/route.ts` - workflow schema to CALL-E config
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
- `lib/compiler.ts` - workflow schema to CALL-E config translation
- `lib/supabase.ts` - Supabase client setup
- `lib/callе-client.ts` - CALL-E SDK/API client wrapper

## Workflow Schema (types/workflow.ts)

The core data contract. A workflow consists of:

- `goal`: string, the overall purpose of the workflow
- `nodes`: array of conversation nodes, each with an id, type (e.g. question, statement,
  branch, terminal), prompt text, and purpose label
- `edges`: array of transitions between nodes, including branch conditions where relevant
  (e.g. qualification outcome, yes/no consent)
- `qualification`: scoring or rule logic that determines the outcome of a call
- `outcomeSchema`: the structured data shape returned after a call completes (e.g.
  qualified boolean, captured fields, next step)

Any change to this schema must be reflected in the generator prompt (lib/generator.ts),
the React Flow renderer (components/WorkflowGraph.tsx), and the CALL-E compiler
(lib/compiler.ts). Treat this file as the source of truth.

## Common Commands

- `npm run dev` - start local dev server
- `npm run build` - production build
- `npm run lint` - lint check
- `npm run test` - run tests (if/when added)

## CALL-E Integration Details

All CALL-E SDK/API calls are wrapped in `lib/callе-client.ts` and `app/api/callе/`, no
CALL-E credentials or raw client calls should appear directly in frontend code or other
API routes. Two entry points into CALL-E:

1. Compilation: workflow schema to CALL-E agent config, happens in
   `app/api/workflows/[id]/compile/route.ts` via `lib/compiler.ts`
2. Execution: launching a campaign triggers real CALL-E calls via
   `app/api/campaigns/[id]/launch/route.ts`, results are received via webhook or polling
   (confirm which CALL-E supports and document the choice here once decided) and stored
   in Supabase

CALL-E call credits are limited (20 free calls per account). Use mock/stub responses
during UI development and integration testing wherever possible, reserve real CALL-E
calls for testing the compilation layer itself and for the final demo recording.

## Environment Variables

Store in `.env.local`, never commit actual values:

- `ANTHROPIC_API_KEY` - Claude API key for workflow generation
- `CALLE_API_KEY` - CALL-E credentials
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase server side key

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
