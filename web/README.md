# Veyra web application

## Implemented phases

### Phase 1: safe CALL-E execution boundary

The campaign screen now provides a deliberately narrow CALL-E integration. It handles one
contact at a time, previews the exact task and result schema, masks the phone number, lists
the expected side effects, and requires explicit approval before execution. Changing the
recipient, task, schema, metadata, or authenticated user invalidates the approval digest.

Fake mode is the default even if `CALLE_API_KEY` exists. It performs no network request,
places no phone call, and consumes no CALL-E credit.

```bash
pnpm install
pnpm demo
pnpm test
```

`pnpm demo` is credential-free and uses the fictional reserved number `+14155550100`. Its
output must report `realCallsPlaced: 0`.

### Phase 2: workflow compiler and durable campaign

The workflow editor's **Compile to Call** action now sends the current edited graph to
the credential-free Python engine. The engine validates the graph, prepends mandatory AI
disclosure/consent/opt-out rules, treats contact fields as untrusted data, and emits a
personalized CALL-E task plus result schema. Veyra then saves the exact workflow,
campaign, first contact, and compiled request in one RLS-protected transaction.

The campaign page loads the persisted campaign instead of fixed task/schema fixtures.
Before every preview it recompiles and saves the current campaign name and first contact,
validates the engine output again in Next.js, and only then enters Phase 1 approval.

Run the engine and web application in separate terminals:

```bash
cd engine
.venv/bin/uvicorn app.main:app --reload --port 8008

cd web
pnpm dev
```

Workflow and campaign persistence requires the Supabase and `DATABASE_URL` settings in
`.env.local`. Compilation itself never receives `CALLE_API_KEY` and cannot place a call.

### Phase 3: durable campaign execution and results

The campaign screen now persists and independently compiles up to ten unique contacts,
shows the exact personalized task and schema for each one, and binds one explicit approval
to the whole immutable batch. Fake mode executes all ten without external requests. Live
mode deliberately remains limited to one explicitly authorized test recipient.

Before submitting, Veyra reserves one durable `call_results` row per contact with the exact
validated request snapshot and idempotency key. A campaign can be claimed for launch only
once. Provider ambiguity becomes `submission_uncertain` and is never retried automatically.

Current CALL-E webhooks are unsigned. Veyra therefore adds a secret token to the per-call
delivery URL, requires `CALL-E-Event-Id` to match the body event id, verifies UUID correlation
metadata, and atomically deduplicates every event before updating its call result. Terminal
webhooks persist structured results, qualification, summary, failures, and a readable
transcript. The campaign screen polls an RLS-protected results endpoint until every run is
terminal.

Apply the Phase 3 database migration before using launch or results:

```bash
pnpm db:migrate
```

### Phase 4: locale setup, scheduling, export, and deployment readiness

Campaign setup now defaults to **Indian English (`en-IN`)** and also offers US English
(`en-US`). CALL-E's Calls SDK exposes a BCP-47 conversation locale rather than a proprietary
voice id, so the selected value is persisted, shown in the exact preview, included in the
approval digest, and sent as `recipient.locale`. Changing it invalidates approval.

An optional start time can be approved up to seven days ahead. Scheduled campaigns are
locked, recomputed at dispatch, and submitted only if their stored approval digest, call
mode, compiler output, live recipient, and live safety window still match. The secured
`GET /api/cron/campaigns` worker requires `Authorization: Bearer $CRON_SECRET`; it never
automatically retries uncertain provider submissions.

Set these only on a deployment with a scheduler that runs often enough:

```env
CAMPAIGN_SCHEDULING_ENABLED=true
CRON_SECRET=<at-least-16-random-characters>
```

Vercel Hobby Cron runs only once per day and is not suitable for precise call scheduling.
For a Vercel plan that supports frequent cron invocations, add this to `web/vercel.json`:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "crons": [{ "path": "/api/cron/campaigns", "schedule": "*/5 * * * *" }]
}
```

Keep `CAMPAIGN_SCHEDULING_ENABLED=false` and leave the start time empty for the hackathon
demo unless that scheduler is configured. Immediate launch remains fully supported.

Results can be downloaded from the campaign screen through the authenticated,
spreadsheet-injection-safe CSV export. `GET /api/health` verifies that the Vercel web app
can reach the engine, while Render continues to use the engine's unauthenticated `/health`.
The repository-root `render.yaml` records the correct Render build, `$PORT`, and health
settings.

Contact CSVs can also be pasted, selected, or dropped onto the campaign builder. Veyra
finds the Name and Phone columns among any unrelated columns, removes spreadsheet display
apostrophes, validates strict E.164 phone numbers, and converts at most ten recipients into
editable rows. Owned workflows can be
deleted from the profile or editor after confirmation; deletion is refused while a related
campaign is scheduled or active.

The profile screen includes an Edit profile dialog for full name, company, and a private
PNG/JPEG/WebP display image up to 2 MB. Images are stored under the user's UUID in a private
Supabase Storage bucket and served only through the authenticated app route. Apply migration
`0004_low_daredevil.sql` before using this dialog:

```bash
pnpm db:migrate
```

Apply the Phase 4 migration before opening a campaign from this version:

```bash
pnpm db:migrate
```

### Routes

- `PATCH /api/profile` updates owned profile details and securely uploads/removes an image.
- `GET /api/profile/image` returns only the signed-in user's private display image.
- `DELETE /api/workflows/[id]` removes an owned workflow and its cascaded inactive
  campaign history, while refusing deletion if a campaign is scheduled or active.
- `POST /api/workflows/[id]/compile` validates/saves the edited workflow and creates an
  owned compiled campaign with one fictional reserved contact.
- `POST /api/campaigns/[id]/compile` recompiles and persists the current first contact.
- `POST /api/campaigns/[id]/preview` validates, saves, and compiles 1–10 contacts and
  returns one batch approval preview.
- `POST /api/campaigns/[id]/launch` recompiles the saved campaign, verifies the exact
  approval, reserves durable runs, and submits each call once.
- `GET /api/campaigns/[id]/results` returns the owned campaign status and durable results.
- `GET /api/campaigns/[id]/results/export` downloads owned results as safe CSV.
- `GET /api/cron/campaigns` dispatches due approved schedules with `CRON_SECRET`.
- `GET /api/health` checks the deployed web-to-engine connection without exposing secrets.
- `POST /api/calle/webhook` accepts secret-token-authorized terminal CALL-E events and
  processes each event id once.
- `POST /api/calls/preview` validates a one-call draft and returns an approval-bound preview.
- `POST /api/calls` recomputes that preview for the authenticated user and submits it once.

All user-facing campaign and call routes require a Supabase session. The webhook uses its
delivery token and event correlation; the cron worker uses `CRON_SECRET`; health is public
and returns no secrets. JSON mutation requests are limited to 32 KB, phone numbers must be
strict E.164, schemas must use CALL-E's supported subset, and unknown request fields are
rejected. There is intentionally no automatic retry: the stable, content-bound idempotency
key is reused for the single SDK submission.

### Enabling a controlled live test

Live mode fails closed and requires every server-side gate below:

1. Set `CALL_MODE=live` and `CALLE_LIVE_ENABLED=true`.
2. Set `CALLE_API_KEY`.
3. Keep `CALLE_BASE_URL=https://api.heycall-e.com`.
4. Set public HTTPS `APP_URL` and a random `CALLE_WEBHOOK_TOKEN` of at least 32 characters.
5. In the UI, preview the exact call, approve it, and separately confirm recipient
   authorization.

A successful live submission may consume CALL-E credit and cannot be cancelled by Veyra
after dispatch. Live mode is no longer restricted to a single pre-authorized recipient or
time window — it will call whatever number is in the compiled contact/campaign, so verify
every recipient by hand before launching. Do not use the fictional sample numbers in live
mode.
