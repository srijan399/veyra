<div align="center" style="text-align: center;">
  <img
    src="https://hackmd.io/_uploads/HyTZ9-OdMx.png"
    alt="Veyra logo"
    width="250"
  />
</div>

# Veyra

Describe an outbound calling process in plain English and voila, Veyra turns it into an editable, reusable phone workflow, and CALL-E executes it through real conversations.

Link to our PR: [PR](#) <br/>
Link to webapp: [Website](https://veyra-sooty.vercel.app)

**Check out:** <br />
[Youtube Demo](#) · [Architecture walkthrough](#) · [Github](https://github.com/srijan399/veyra) · [Devpost submission](#)

**Built with:** CALL-E · Next.js 16 · TypeScript · FastAPI · Gemini · Supabase · RabbitMQ · Drizzle ORM · Tailwind CSS · React 19

## The Problem

Businesses that rely on high-volume, repetitive outbound calling such as **sales qualification**, **appointment confirmation**, **renewal reminders** must either hire large teams to run scripts manually or ask engineers to build voice-agent logic for every campaign.

Both are **slow** and **do not scale well**:

- Manual call teams are **expensive**, **inconsistent**, and **difficult** to **scale** quickly.
- Hand-built voice agents **require an AI engineer** to translate each process into prompts, conversation states, and branching logic and repeat that work whenever it changes.

There is no direct path from **_“here is our calling process”_** to a **working, structured, production-ready voice agent.**

## Our Proposed Solution

Veyra is a **workflow generation** **and orchestration** layer built on CALL-E which forms the crux of the system.

A business user describes a calling process in natural language.

**Veyra** generates a **structured, editable and re-usable** conversation workflow with _nodes, branches, qualification logic, and data capture_, then compiles it into a CALL-E **Calls API task and result schema**.

A developer or non-technical operator can **refine the workflow**, add contacts manually or drop in a CSV, **approve the exact campaign**, and launch it through CALL-E. Completed calls return structured outcomes and transcripts to Veyra's results dashboard.

Past campaigns can be cloned into new drafts, allowing teams to reuse the same workflow and contacts while requiring a fresh preview and approval.

CALL-E does not execute an external branching graph so Veyra flattens the graph at compile time into a natural-language task and result schema.

The **workflow graph** is Veyra's own **authoring and editing abstraction**.

### The ideal customer profile

Industry agnostic sales and operations teams that run repetitive outbound campaigns and need structured, actionable outcomes from every conversation.

## Setup

Veyra consists of a **Next.js web application**, **a stateless FastAPI workflow engine**, **Supabase**, **RabbitMQ**, and a long-running call-dispatch worker. The worker is required for both fake and live campaigns - without it, calls remain queued.

### Prerequisites

- Node.js 20.9 or newer, with Corepack enabled
- Python 3.11 or newer
- A Supabase project
- A Gemini API key for workflow generation and natural-language editing
- A local or hosted RabbitMQ broker
- Optional: CALL-E credentials, required only when placing a real call

### 1. Configure the workflow engine

```bash
cd engine
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

Set `GEMINI_API_KEY` in `engine/.env`. `GEMINI_MODEL` can normally keep its default.

To protect a deployed engine, set `ENGINE_SHARED_SECRET` to a random value and use the same value in the web application's environment.

Start the engine:

```bash
make run
```

It runs at `http://localhost:8008`; `GET /health` should return `{"status":"ok"}`.

Run `.venv/bin/python -m pytest -p no:cacheprovider` for the engine test suite.

### 2. Configure Supabase and the web application

In Supabase, turn off **Authentication > Providers > Email > Confirm email** so a new account receives a session immediately.

Then configure the web application:

```bash
cd web
corepack enable
corepack prepare pnpm@11.23.0 --activate
pnpm install
cp .env.example .env.local
```

Fill in these required values in `web/.env.local`:

```env
ENGINE_URL=http://localhost:8008
ENGINE_SHARED_SECRET=
APP_URL=http://localhost:3000

DATABASE_URL=<Supabase transaction-pooler URI for the postgres role>
NEXT_PUBLIC_SUPABASE_URL=<Supabase project URL>
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<Supabase publishable key>

RABBIT_MQ_URL=<RabbitMQ AMQP connection URL>

CALL_MODE=fake
CALLE_LIVE_ENABLED=false
CAMPAIGN_SCHEDULING_ENABLED=false
```

If the engine has an `ENGINE_SHARED_SECRET`, place the same value here. Apply every database migration before starting the app:

```bash
pnpm db:migrate
pnpm dev
```

The web app is available at `http://localhost:3000`, and `GET /api/health` checks that it can reach the engine.

### 3. Start the dispatch worker

Open a third terminal and run:

```bash
cd web
pnpm worker
```

The worker consumes `veyra.call-dispatch` jobs from RabbitMQ and performs fake or live CALL-E submissions outside the web request. Keep it running while testing campaign launches.

### 4. Test safely in fake mode

Keep `CALL_MODE=fake` and `CALLE_LIVE_ENABLED=false`.

Create an account, generate and edit a workflow, compile a campaign, add contacts manually or from a CSV containing `Name` and `Phone` columns, preview the campaign, approve it, and launch it.

The worker will produce simulated results without contacting CALL-E or consuming call credits.

You can also verify the execution boundary without credentials:

```bash
cd web
pnpm demo
pnpm lint
pnpm test
pnpm build
```

### 5. Enable live calls only when ready

Set the following server-side values on the web deployment and on the dispatch worker:

```env
CALL_MODE=live
CALLE_LIVE_ENABLED=true
CALLE_API_KEY=<CALL-E API key>
CALLE_BASE_URL=https://api.heycall-e.com
APP_URL=https://<public-web-app-domain>
CALLE_WEBHOOK_TOKEN=<at-least-32-random-characters>
```

`APP_URL` is the public frontend URL because CALL-E posts results to `<APP_URL>/api/calle/webhook`.

Preview the exact campaign and confirm recipient permission before launching. Veyra does not automatically retry an uncertain submission.

**Scheduled campaigns** additionally require `CAMPAIGN_SCHEDULING_ENABLED=true`, a `CRON_SECRET` of at least 16 characters, and a frequent scheduler calling `GET /api/cron/campaigns`.

**For deployment**, the root `render.yaml` provisions the Python engine.

Deploy the Next.js application separately on Vercel. The RabbitMQ consumer must run as a separate, long-running worker process because it cannot live inside a request-scoped Vercel function.

## Our System Architecture in full flow

```mermaid
flowchart TD
    U["User<br/>natural-language prompt"] --> W["Next.js application"]
    W --> A["Supabase Auth"]
    W --> E["FastAPI workflow engine"]
    E --> G["Gemini<br/>generate and edit <br />workflow"]
    G --> E
    E --> W
    W --> D["Supabase Postgres<br/>workflows, campaigns, <br /> results"]
    W --> Q["RabbitMQ<br/>one durable job per call"]
    Q --> K["Dispatch worker"]
    K --> C["CALL-E Calls API"]
    C --> P["Real phone conversation"]
    C --> H["Authenticated result <br />webhook"]
    H --> D
    D --> R["Results dashboard and <br />CSV export"]
```

## Example Generated Workflow

The following wealth-management example shows the full transformation from business intent to a structured CALL-E request.

### Initial Prompt

Call people who requested information about our **wealth management services**, understand **their financial goals**, **risk tolerance** and **investment horizon**, answer basic questions, qualify them, and **book an advisor consultation for qualified leads**.

Veyra turns that request into an editable workflow such as:

```mermaid
flowchart TD
    A[START] --> B[Introduce AI + Company]
    B --> C[Ask permission to continue]
    C -->|No| Z1[END]
    C -->|Yes| D[Financial Goal?]
    D --> E[Investment Horizon]
    E --> F[Risk Tolerance]
    F --> G[Investment Experience]
    G --> H[Answer Questions]
    H --> I[Lead Qualification]
    I -->|Qualified| J[Book Advisor]
    I -->|Not Ready| K[Send Info]
    J --> Z2[END]
    K --> Z2[END]
```

The user can review the purpose of every generated node if you didn't follow the chart:

| Node               | Purpose                          |
| ------------------ | -------------------------------- |
| Introduction       | Establish identity and purpose   |
| Consent            | Confirm willingness to talk      |
| Financial Goals    | Understand primary objective     |
| Investment Horizon | Determine time horizon           |
| Risk Profile       | Understand risk tolerance        |
| Experience         | Determine investment familiarity |
| Questions          | Answer basic questions           |
| Qualification      | Score the lead                   |
| Conversion         | Offer advisor consultation       |
| Completion         | Capture outcome                  |

### What this compiles into

The graph above is not sent to CALL-E. At compile time it is flattened into a single Calls API request, one per contact:

```yaml
task:
  You are Ava calling on behalf of Northbridge Wealth. Introduce yourself as an AI
  assistant and reference the wealth management information Marta Reyes requested.
  Ask permission to continue. If they decline, offer to send information by email and
  end politely. If they agree, ask about their financial goal—retirement, wealth growth,
  tax planning, education, or another goal—followed by their investment horizon and
  risk tolerance. Answer basic questions about the service, but never give financial
  advice. If they qualify, offer to book an advisor consultation. If they are not ready,
  offer to send information.

result_schema:
  type: object
  additionalProperties: false
  properties:
    qualified:
      type: boolean
      description: Met the advisor threshold

    primary_goal:
      type: string
      enum:
        - retirement
        - wealth_growth
        - tax_planning
        - education
        - other

    horizon_years:
      type: number

    risk_profile:
      type: string
      enum:
        - cautious
        - balanced
        - growth

    slot_booked:
      type: boolean

    next_step:
      type: string
      enum:
        - book_advisor
        - send_info
        - retry
        - do_not_contact

metadata:
  campaignId: c_2f91
  contactId: ct_88a3

webhook_url: https://veyra.app/api/calle/webhook
```

The dispatch worker sends it with `Idempotency-Key: veyra_c_2f91_ct_88a3` to prevent double calling.

A developer can then ask Veyra to “add a question about approximate investable assets after risk tolerance,” and the platform updates the graph without requiring manual prompt or state-machine editing.

## Two Users, One Platform

```mermaid
flowchart TD
    P[PLATFORM] --> BU[Business User]
    P --> DEV[Developer]

    BU --> BU1["Describe, review, and <br />launch a campaign"]
    DEV --> DEV1["Refine workflow logic,<br/>schemas, credentials, <br /> and deployment"]

    BU1 --> WG[Workflow Generator]
    DEV1 --> WG

    WG --> CO["Compiler<br/>Calls API task + <br />result schema"]
    CO --> Q["RabbitMQ"]
    Q --> WK["Dispatch worker"]
    WK --> CE["CALL-E Calls API"]
    CE --> RC["Real phone conversations"]
```

- **Business user**
  describes intent in plain language, reviews and approves the generated workflow, launches campaigns, and reviews results.
- **Developer**
  refines workflow logic, schemas, call settings, and deployment while
  owning the reliability of live campaigns.

CALL-E remains the **developer-first execution layer**, while Veyra makes the **authoring and campaign experience accessible to non-technical operators**.

## Target Customers

### Priority Segments

**1. Sales and lead generation teams (Veyra's strongest initial market)**

- Wealth management firms
- Insurance companies
- Real estate companies
- Education institutes
- Automotive dealerships
- SaaS companies
- B2B service companies.

Typical workflow: import a lead list, call, qualify, answer questions, book a meeting, and export structured results.

**2. Customer operations and call centers**

Internal teams handling:

- appointment confirmations
- onboarding
- feedback collection
- renewal reminders
- document collection
- service follow-ups
- verification

Today, a manager writes a script, employees follow it, and results are entered manually. With Veyra, the manager describes the process, a workflow is generated, CALL-E makes the calls, and structured results appear in the dashboard.

**3. Agencies, BPOs, and outsourced call centers**

An agency running campaigns for many clients today needs a separate script or process for each client.

With Veyra, each client gets a reusable workflow and campaign without engineering a new voice agent each time. This makes the platform useful infrastructure for voice-call agencies.

**4. Financial services**

- Wealth managers
- Insurance companies
- Loan providers
- Financial advisory firms
- Fintech companies.

Use cases include lead qualification, insurance requirement collection, and loan pre-qualification.

The platform should remain within qualification, information collection, FAQs, and appointment booking and it should not provide financial advice.

**5. Automotive**

Dealerships can use Veyra for test-drive bookings, service reminders, lead qualification, vehicle-availability enquiries, and finance or insurance qualification.

### Segment Priority

| Customer            | Use case                               | Priority    |
| ------------------- | -------------------------------------- | ----------- |
| Sales teams         | Lead qualification                     | High        |
| Call centers / BPOs | Automated outbound campaigns           | High        |
| Financial services  | Advisor / insurance lead qualification | High        |
| Education           | Student qualification                  | Medium-high |
| Agencies            | Run campaigns for clients              | Medium-high |
| Automotive          | Leads, service, test drives            | Medium      |

## Business Model

Potential monetisation paths include:

- **Usage-based pricing**
  charge per generated workflow and campaign call or minute.
- **Seat-based pricing**
  teams pay per seat for workflow editing, campaign management, and analytics
