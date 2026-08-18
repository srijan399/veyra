import CampaignBuilder from "@/components/CampaignBuilder";
import StepHeader from "@/components/StepHeader";
import { SAMPLE_CONTACTS, SAMPLE_CSV } from "@/lib/sample-campaign";
import { SAMPLE_WORKFLOW } from "@/lib/sample-workflow";

export default async function CampaignPage({
  searchParams,
}: PageProps<"/campaign">) {
  // `at` is stamped by the Workflow step's Compile action, so the badge shows the
  // real compile time rather than a hardcoded one.
  const { at } = await searchParams;
  const compiledAt = typeof at === "string" ? at : "14:07:36";

  return (
    <div className="flex min-h-screen flex-col bg-ink">
      <StepHeader current="campaign" />
      <CampaignBuilder
        initialName="Wealth Q3 — Inbound Enquiries"
        initialContacts={SAMPLE_CONTACTS}
        initialCsv={SAMPLE_CSV}
        stepCount={SAMPLE_WORKFLOW.nodes.length}
        compiledAt={compiledAt}
      />
    </div>
  );
}
