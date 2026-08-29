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

### Routes

- `POST /api/workflows/[id]/compile` validates/saves the edited workflow and creates an
  owned compiled campaign with one fictional reserved contact.
- `POST /api/campaigns/[id]/compile` recompiles and persists the current first contact.
- `POST /api/calls/preview` validates a one-call draft and returns an approval-bound preview.
- `POST /api/calls` recomputes that preview for the authenticated user and submits it once.

All four routes require a Supabase session and JSON content. Requests are limited to 32 KB,
phone numbers must be strict E.164, schemas must use CALL-E's supported subset, and unknown
request fields are rejected. There is intentionally no automatic retry: the stable,
content-bound idempotency key is reused for the single SDK submission.

### Enabling a controlled live test

Live mode fails closed and requires every server-side gate below:

1. Set `CALL_MODE=live` and `CALLE_LIVE_ENABLED=true`.
2. Set `CALLE_API_KEY`.
3. Set `CALLE_TEST_RECIPIENT_E164` to one explicitly authorized test recipient. Only that
   exact number can be called.
4. Set `CALLE_LIVE_WINDOW_START` and `CALLE_LIVE_WINDOW_END` to a currently active ISO-8601
   window no longer than four hours.
5. Keep `CALLE_BASE_URL=https://api.heycall-e.com`.
6. In the UI, preview the exact call, approve it, and separately confirm recipient
   authorization.

A successful live submission may consume CALL-E credit and cannot be cancelled by Veyra
after dispatch. Run live tests only with a recipient who has explicitly agreed to that
specific call. Do not use the fictional sample numbers in live mode.
