"use client";

import { useRouter } from "next/navigation";
import { useLayoutEffect, useRef, useState } from "react";

const EXAMPLES = [
  {
    id: "wealth",
    label: "Wealth Management",
    text: "Call people who requested information about our wealth management services, understand their financial goals and risk tolerance, qualify them, and book an advisor consultation.",
  },
  {
    id: "education",
    label: "Education",
    text: "Call prospective students who downloaded our course guide, find out which programme and start date they want, check funding, and book a call with admissions.",
  },
  {
    id: "insurance",
    label: "Insurance",
    text: "Call households whose home policy renews in 30 days, confirm cover and property details, flag anyone underinsured, and transfer qualified leads to a broker.",
  },
];

const PLACEHOLDER =
  "Describe the calling process you want, for example: call people who requested information about our wealth management services, understand their financial goals and risk tolerance, qualify them, and book an advisor consultation.";

export default function PromptComposer() {
  const [prompt, setPrompt] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const router = useRouter();

  // Grow with the content, never below the 172px resting height.
  const autoResize = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(el.scrollHeight, 172)}px`;
  };

  useLayoutEffect(autoResize, [prompt]);

  const generate = async () => {
    if (!prompt.trim() || pending) return;
    setPending(true);
    setError(null);

    try {
      const res = await fetch("/api/workflows/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const body = await res.json().catch(() => null);

      if (!res.ok) {
        setError(body?.error ?? "Could not generate a workflow, try again.");
        return;
      }

      router.push(`/workflow/${body.workflow.id}`);
    } catch {
      setError("Could not reach the server, try again.");
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <div className="border-2 border-bone/[.26] bg-panel">
        <textarea
          ref={textareaRef}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) generate();
          }}
          placeholder={PLACEHOLDER}
          className="min-h-[172px] w-full resize-none overflow-hidden border-0 bg-transparent px-[22px] py-5 text-base leading-[1.55] text-bone outline-none placeholder:text-bone/35"
        />
        <div className="flex items-center justify-between gap-4 border-t border-bone/[.18] py-3 pl-[22px] pr-3.5">
          <span className="text-[11px] uppercase tracking-[.08em] text-bone/[.38]">
            {prompt.length} characters
          </span>
          <button
            type="button"
            onClick={generate}
            disabled={!prompt.trim() || pending}
            className="inline-flex cursor-pointer items-center gap-2.5 whitespace-nowrap border-0 bg-flame px-[18px] py-3 text-sm font-extrabold tracking-[.02em] text-ink disabled:cursor-not-allowed disabled:opacity-45"
          >
            {pending ? "Generating…" : "Generate Workflow"}
            {!pending && <span className="text-[11px] tracking-[.06em] opacity-70">⌘ ↵</span>}
          </button>
        </div>
      </div>

      {error && <p className="mt-3 text-[13px] text-blush">{error}</p>}

      <div className="mt-[26px] flex flex-wrap items-center gap-2.5">
        <span className="mr-1 text-[11px] uppercase tracking-[.12em] text-bone/[.38]">
          Examples
        </span>
        {EXAMPLES.map((ex) => (
          <button
            key={ex.id}
            type="button"
            onClick={() => setPrompt(ex.text)}
            className="cursor-pointer border border-bone/[.26] bg-transparent px-[13px] py-[7px] text-[12.5px] text-bone hover:bg-bone/[.07]"
          >
            {ex.label}
          </button>
        ))}
      </div>
    </>
  );
}
