"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface WorkflowOption {
  id: string;
  goal: string;
}

function errorMessage(value: unknown): string {
  if (typeof value !== "object" || value === null) return "The request failed.";
  const body = value as { error?: unknown; issues?: unknown };
  const summary = typeof body.error === "string" ? body.error : "The request failed.";
  const issues = Array.isArray(body.issues)
    ? body.issues.filter((item): item is string => typeof item === "string")
    : [];
  return issues.length ? `${summary}: ${issues.join("; ")}` : summary;
}

export default function NewCampaignForm({
  workflows,
  initialWorkflowId,
}: {
  workflows: WorkflowOption[];
  initialWorkflowId: string;
}) {
  const router = useRouter();
  const [workflowId, setWorkflowId] = useState(initialWorkflowId);
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workflowId,
          ...(name.trim() ? { name: name.trim() } : {}),
        }),
      });
      const body: unknown = await response.json();
      if (!response.ok) throw new Error(errorMessage(body));
      const campaignId = (body as { campaignId?: unknown }).campaignId;
      if (typeof campaignId !== "string") {
        throw new Error("The response did not include a campaign id.");
      }
      router.push(`/campaigns/${campaignId}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Campaign could not be created.");
      setPending(false);
    }
  };

  return (
    <div className="mt-8 w-full max-w-[520px]">
      <label className="block text-xs text-bone/55">
        <span className="mb-2 block font-extrabold uppercase tracking-[.1em] text-bone/65">
          Workflow
        </span>
        <select
          value={workflowId}
          onChange={(event) => setWorkflowId(event.target.value)}
          className="w-full border border-bone/[.26] bg-panel px-3.5 py-3 text-sm text-bone outline-none"
        >
          {workflows.map((workflow) => (
            <option key={workflow.id} value={workflow.id}>
              {workflow.goal}
            </option>
          ))}
        </select>
      </label>

      <label className="mt-5 block text-xs text-bone/55">
        <span className="mb-2 block font-extrabold uppercase tracking-[.1em] text-bone/65">
          Campaign name (optional)
        </span>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={120}
          placeholder="Defaults to the workflow goal"
          className="w-full border border-bone/[.26] bg-panel px-3.5 py-3 text-sm text-bone outline-none placeholder:text-bone/25"
        />
      </label>

      {error ? (
        <div
          role="alert"
          className="mt-5 border border-red-400/50 bg-red-950/30 p-3 text-sm text-red-200"
        >
          {error}
        </div>
      ) : null}

      <button
        type="button"
        onClick={submit}
        disabled={pending}
        className="mt-6 inline-flex cursor-pointer items-center gap-2.5 border-0 bg-flame px-5 py-[13px] text-sm font-extrabold text-ink disabled:cursor-not-allowed disabled:opacity-40"
      >
        {pending ? "Creating campaign…" : "Create campaign"}
      </button>
    </div>
  );
}
