import StepHeader from "@/components/StepHeader";
import WorkflowEditor from "@/components/WorkflowEditor";
import { SAMPLE_WORKFLOW } from "@/lib/sample-workflow";

export default function WorkflowPage() {
  // TODO: load the generated workflow by id once /api/workflows/generate lands
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-ink">
      <StepHeader current="workflow" />
      <WorkflowEditor workflow={SAMPLE_WORKFLOW} />
    </div>
  );
}
