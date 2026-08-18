# Veyra

### Workflow Engine for CALL-E Voice Agent Swarms

---

## Elevator Pitch

You describe the outbound calling process you want and Veyra turns it into an executable phone workflow, complete with conversation logic, qualification rules, and structured outcomes, then CALL-E's voice agents run it at scale on real calls.

## Positioning Statement

"We help businesses turn any outbound calling process into an executable AI workflow. Describe what the agent needs to accomplish, our platform generates the conversation flow, qualification logic and structured outputs, and CALL-E handles the actual calls."

What could be an alternate framing for a developer customer base:
"A development and orchestration layer for building production phone-call workflows with CALL-E."

## The Problem

Businesses that rely on high-volume, repetitive outbound calling (sales qualification, appointment confirmation, renewal reminders, student counseling signups) either hire large calling teams to run scripts manually, or need engineers to hand build voice agent logic for every new campaign. Both are slow and do not scale well:

- Manual call teams are expensive, inconsistent, and hard to scale up or down quickly.
- Hand built voice agents require an AI engineer to translate a business process into prompts, conversation states, and branching logic, then rebuild it every time the process changes.

There is no fast path from "here is the business process in plain English" to "here is a working, structured, production ready voice agent."

## The Solution

Veyra is a workflow generation and orchestration layer on top of CALL-E. A business user describes their desired call process in natural language. The platform generates a structured, editable conversation workflow (nodes, branching logic, qualification scoring, data capture) and compiles it into a CALL-E native agent configuration. A developer can then refine the generated workflow, connect it to a contact list or CRM, and launch it as a live campaign that CALL-E executes over real phone calls, returning structured, usable results.

## System Architecture

```mermaid
flowchart TD
A["User<br/>(natural-language prompt)"] --> B["Workflow Generator<br/>goal, info needed, flow, logic, schema"]
B --> C["Generated Workflow<br/>(editable)"]
C --> D["Campaign Builder<br/>workflow + contacts + schedule"]
D --> E["CALL-E Integration<br/>SDK / API / MCP"]
E --> F["Real phone calls"]
F --> G["Workflow-driven Agent<br/>ask, listen, branch, qualify"]
G --> H["Structured Results<br/>status, transcript, CRM/webhook"]
```

## Example Generated Workflow (Wealth Management Lead Qualification)

Prompt given to the platform:
"Call people who requested information about our wealth management services, understand their financial goals, risk tolerance and investment horizon, answer basic questions, qualify them, and book an advisor consultation for qualified leads."

Generated flow:

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

Generated workflow summary shown to the user:

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

The key product moment: a developer can then say "add a question about approximate investable assets after risk tolerance," and the platform updates the workflow accordingly, without hand editing prompts or state machines. This is the strongest demonstration of the platform being a real devtool rather than a wrapper.

## Two Users, One Platform

```mermaid
flowchart TD
    P[PLATFORM] --> BU[Business User]
    P --> DEV[Developer]

    BU --> BU1["Create a campaign"]
    DEV --> DEV1["Configure workflow, branching,<br/>schemas, integrations, CALL-E<br/>credentials, webhooks, CRM connections"]

    BU1 --> WG[Workflow Generator]
    DEV1 --> WG

    WG --> CE[CALL-E]
    CE --> RC[Real phone calls]
```

- **Business user**: describes intent in plain language ("qualify people interested in retirement planning"), reviews and approves the generated workflow, launches campaigns, reviews results.
- **Developer / ops engineer**: refines the generated workflow, wires up integrations (CRM, webhooks, contact lists), manages CALL-E credentials, and owns the technical reliability of live campaigns.

This dual audience is important because CALL-E is positioned as a developer-first platform. Veyra extends that developer story upward to non-technical business users while keeping full control available to developers underneath.

## Target Customers

The ideal customer profile: sales and operations teams at businesses that run repetitive outbound phone campaigns and need structured outcomes from each conversation.

### Priority Segments

**1. Sales and lead generation teams (strongest initial market)**
Wealth management firms, insurance companies, real estate companies, education institutes, automotive dealerships, SaaS companies, B2B service companies. Workflow: lead list, call, qualify, answer questions, book meeting, push to CRM.

**2. Customer operations and call centers**
Internal teams handling appointment confirmations, onboarding, feedback collection, renewal reminders, document collection, service follow ups, verification. Today this is manager writes script, employees follow script, data entered manually. Veyra replaces this with manager describes process, workflow generated, AI makes calls, structured results flow to CRM. Strong, easy to explain ROI story.

**3. Agencies, BPOs, and outsourced call centers**
An agency running campaigns for many clients today needs a separate script or process per client. With Veyra, each client gets their own generated workflow and campaign without engineering a new voice agent each time. This makes the platform infrastructure for voice-call agencies, a strong recurring revenue customer type.

**4. Financial services**
Wealth managers, insurance companies, loan providers, financial advisory firms, fintech companies. Use cases: lead qualification, insurance requirement collection, loan pre-qualification. Important boundary: the platform should stay in qualification, information collection, FAQs, and appointment booking, and should not give actual financial advice.

**5. Automotive**
Dealerships using it for test drive booking, service reminders, lead qualification, vehicle availability inquiries, and finance/insurance lead qualification.

### Segment Priority Table

| Customer            | Use case                               | Priority    |
| ------------------- | -------------------------------------- | ----------- |
| Sales teams         | Lead qualification                     | High        |
| Call centers / BPOs | Automated outbound campaigns           | High        |
| Financial services  | Advisor / insurance lead qualification | High        |
| Education           | Student qualification                  | Medium-high |
| Agencies            | Run campaigns for clients              | Medium-high |
| Automotive          | Leads, service, test drives            | Medium      |

### How we want to position:

We want to lead with wealth management lead qualification as the concrete demo, then explicitly show that the same engine generates education, insurance, real estate, or appointment booking workflows from a different prompt. This proves the platform is horizontal infrastructure, not a one-off vertical bot, while still giving the judges one clear, well-executed use case to evaluate.

## Business Model

Potential monetization paths worth mentioning in the pitch, even briefly, since judges reward "real world impact" and viability beyond the hackathon:

- **Usage-based pricing**: charge per generated workflow and per campaign minute/call, layered on top of CALL-E's own usage costs, similar to how infrastructure tools price above a base API.
- **Seat-based pricing for developer and business users**: teams pay per seat for workflow editing, campaign management, and analytics access.
- **Agency / BPO tier**: a higher tier for agencies managing multiple client workflows and campaigns from one dashboard, priced on client count or campaign volume.
- **Template marketplace**: vertical specific workflow templates (wealth management qualification, student counseling, insurance intake) that can be sold, shared, or contributed back to the CALL-E ecosystem as reusable skills or plugins.

## Our Submission Checklist

- [ ] Open pull request to https://github.com/CALLE-AI/awesome-phone-call-agents under the correct contribution area
- [ ] Record a public YouTube or Vimeo demo video, about three minutes
- [ ] Submit CALL-E account email
- [ ] Submit PR URL on Devpost
- [ ] Optional: link to a functional demo application
- [ ] Optional: submit CALL-E Feedback Survey for Most Valuable Feedback prize eligibility
