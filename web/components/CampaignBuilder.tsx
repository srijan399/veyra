"use client";

import { useState } from "react";
import type { SafeCallExecution } from "@/lib/calle/client";
import type { SafeCallDraft, SafeCallPreview } from "@/lib/calle/safety";
import type { Contact } from "@/types/campaign";

type Entry = "rows" | "csv";
type PendingAction = "compile-preview" | "execute" | null;

const KICKER = "text-[10.5px] uppercase tracking-[.14em] text-bone/50";
const TAB =
  "flex-none cursor-pointer whitespace-nowrap border-0 px-[15px] py-2 text-[12.5px] font-extrabold";
const RULE = "border-t-2 border-bone/[.26]";

let nextId = 0;
const newContact = (name = "", phoneNumber = ""): Contact => ({
  id: `c${nextId++}`,
  name,
  phoneNumber,
});

/** "Marta Reyes, +14155550100" per line. */
function parseCsv(csv: string): Contact[] {
  return csv
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => {
      const [name, phone] = line.split(",");
      return newContact((name ?? "").trim(), (phone ?? "").trim());
    });
}

function errorMessage(value: unknown): string {
  if (typeof value !== "object" || value === null) return "The request failed.";
  const body = value as { error?: unknown; detail?: unknown; issues?: unknown };
  const summary = typeof body.error === "string" ? body.error : "The request failed.";
  const issues = Array.isArray(body.issues)
    ? body.issues.filter((item): item is string => typeof item === "string")
    : [];
  if (!issues.length && typeof body.detail === "string") issues.push(body.detail);
  return issues.length ? `${summary}: ${issues.join("; ")}` : summary;
}

interface CampaignBuilderProps {
  campaignId: string;
  workflowId: string;
  initialName: string;
  initialContacts: Contact[];
  initialCsv: string;
  /** Number of nodes in the persisted workflow, shown in the status badge. */
  stepCount: number;
  initialDraft: SafeCallDraft;
}

export default function CampaignBuilder({
  campaignId,
  workflowId,
  initialName,
  initialContacts,
  initialCsv,
  stepCount,
  initialDraft,
}: CampaignBuilderProps) {
  const [name, setName] = useState(initialName);
  const [contacts, setContacts] = useState(initialContacts);
  const [entry, setEntry] = useState<Entry>("rows");
  const [csv, setCsv] = useState(initialCsv);
  const [preview, setPreview] = useState<SafeCallPreview | null>(null);
  const [execution, setExecution] = useState<SafeCallExecution | null>(null);
  const [previewApproved, setPreviewApproved] = useState(false);
  const [recipientAuthorized, setRecipientAuthorized] = useState(false);
  const [pending, setPending] = useState<PendingAction>(null);
  const [error, setError] = useState<string | null>(null);
  const [compiledDraft, setCompiledDraft] = useState<SafeCallDraft | null>(initialDraft);

  const csvLines = csv.split("\n").filter((line) => line.trim()).length;
  const selectedContact = contacts[0];

  const resetApproval = () => {
    setCompiledDraft(null);
    setPreview(null);
    setExecution(null);
    setPreviewApproved(false);
    setRecipientAuthorized(false);
    setError(null);
  };

  const editContact = (id: string, patch: Partial<Contact>) => {
    resetApproval();
    setContacts((previous) =>
      previous.map((contact) =>
        contact.id === id ? { ...contact, ...patch } : contact,
      ),
    );
  };

  const requestPreview = async () => {
    if (!selectedContact) return;
    setPending("compile-preview");
    setError(null);
    setExecution(null);
    setPreviewApproved(false);
    setRecipientAuthorized(false);

    try {
      const compileResponse = await fetch(`/api/campaigns/${campaignId}/compile`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          contact: {
            name: selectedContact.name,
            phoneNumber: selectedContact.phoneNumber,
            ...(selectedContact.metadata ? { metadata: selectedContact.metadata } : {}),
          },
        }),
      });
      const compileBody: unknown = await compileResponse.json();
      if (!compileResponse.ok) throw new Error(errorMessage(compileBody));
      const compiled = compileBody as {
        contact?: Contact;
        draft?: SafeCallDraft;
      };
      if (!compiled.contact || !compiled.draft) {
        throw new Error("The compiler response was incomplete.");
      }
      const persistedContact = compiled.contact;
      const nextDraft = compiled.draft;

      setCompiledDraft(nextDraft);
      setContacts((previous) => [persistedContact, ...previous.slice(1)]);

      const previewResponse = await fetch("/api/calls/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(nextDraft),
      });
      const previewBody: unknown = await previewResponse.json();
      if (!previewResponse.ok) throw new Error(errorMessage(previewBody));
      const nextPreview = (previewBody as { preview?: SafeCallPreview }).preview;
      if (!nextPreview) throw new Error("The preview response was incomplete.");
      setPreview(nextPreview);
    } catch (caught) {
      setPreview(null);
      setError(caught instanceof Error ? caught.message : "The preview failed.");
    } finally {
      setPending(null);
    }
  };

  const executeCall = async () => {
    if (!compiledDraft || !preview || !previewApproved) return;
    setPending("execute");
    setError(null);
    setExecution(null);

    try {
      const response = await fetch("/api/calls", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...compiledDraft,
          approval: {
            approvalDigest: preview.approvalDigest,
            previewApproved,
            recipientAuthorizationConfirmed: recipientAuthorized,
            callCount: preview.callCount,
          },
        }),
      });
      const body: unknown = await response.json();
      if (!response.ok) throw new Error(errorMessage(body));
      const nextExecution = (body as { execution?: SafeCallExecution }).execution;
      if (!nextExecution) throw new Error("The execution response was incomplete.");
      setExecution(nextExecution);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The call request failed.");
    } finally {
      setPending(null);
    }
  };

  const canExecute =
    previewApproved &&
    (!preview?.recipientAuthorizationRequired || recipientAuthorized) &&
    !execution;

  return (
    <main className="flex-1 px-12 pb-[72px] pt-[52px]">
      <div className="mx-auto max-w-[840px] animate-vfade">
        <div className="mb-6 inline-flex items-center gap-[9px] whitespace-nowrap border border-flame/60 px-[11px] py-1.5 text-[11px] uppercase tracking-[.1em] text-blush">
          <span className="size-1.5 bg-flame" />
          Persisted workflow · {stepCount} steps · campaign {campaignId.slice(0, 8)}
        </div>
        <a
          href={`/workflow/${workflowId}`}
          className="mb-5 block w-fit text-xs text-bone/45 underline decoration-bone/25 underline-offset-4 hover:text-bone"
        >
          Back to workflow
        </a>

        <h1 className="mb-[34px] text-4xl font-extrabold leading-[1.08] tracking-[-.02em]">
          Review one controlled call.
        </h1>

        <div className={`mb-[34px] pt-[22px] ${RULE}`}>
          <div className={`${KICKER} mb-3`}>01 · Campaign name</div>
          <input
            value={name}
            onChange={(event) => {
              resetApproval();
              setName(event.target.value);
            }}
            maxLength={120}
            className="w-full max-w-[520px] border border-bone/[.26] bg-panel px-3.5 py-3 text-base font-extrabold text-bone outline-none"
          />
        </div>

        <div className={`pt-[22px] ${RULE}`}>
          <div className="mb-3.5 flex items-center justify-between gap-4">
            <div className={`${KICKER} whitespace-nowrap`}>
              02 · Contacts <span className="text-bone/35">({contacts.length})</span>
            </div>
            <div className="flex border border-bone/[.26]">
              {(["rows", "csv"] as const).map((value, index) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setEntry(value)}
                  className={`${TAB} ${index === 0 ? "border-r border-bone/[.26]" : ""} ${
                    entry === value ? "bg-flame text-ink" : "bg-transparent text-bone"
                  }`}
                >
                  {value === "rows" ? "Add rows" : "Paste CSV"}
                </button>
              ))}
            </div>
          </div>

          {entry === "rows" ? (
            <div>
              <div className="grid grid-cols-[1fr_1fr_40px] gap-x-3.5 border-b border-bone/[.18] pb-2 text-[10.5px] uppercase tracking-[.12em] text-bone/40">
                <span>Name</span>
                <span>Phone number (strict E.164)</span>
                <span />
              </div>

              {contacts.map((contact, index) => (
                <div
                  key={contact.id}
                  className="grid grid-cols-[1fr_1fr_40px] items-center gap-x-3.5 border-b border-bone/[.12]"
                >
                  <input
                    value={contact.name}
                    onChange={(event) => editContact(contact.id, { name: event.target.value })}
                    maxLength={120}
                    placeholder="Name"
                    className="border-0 bg-transparent py-3 text-sm text-bone outline-none placeholder:text-bone/25"
                  />
                  <input
                    value={contact.phoneNumber}
                    onChange={(event) =>
                      editContact(contact.id, { phoneNumber: event.target.value })
                    }
                    placeholder="+14155550100"
                    className="border-0 bg-transparent py-3 text-sm text-bone/80 outline-none placeholder:text-bone/25"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      resetApproval();
                      setContacts((previous) =>
                        previous.filter((item) => item.id !== contact.id),
                      );
                    }}
                    aria-label={`Remove ${contact.name || "contact"}`}
                    className="cursor-pointer justify-self-end border-0 bg-transparent p-1 text-[15px] text-bone/35"
                  >
                    ×
                  </button>
                  {index === 0 ? (
                    <span className="col-span-3 pb-2 text-[11px] text-blush/70">
                      Phase 2 compile and preview recipient
                    </span>
                  ) : null}
                </div>
              ))}

              <button
                type="button"
                onClick={() => {
                  resetApproval();
                  setContacts((previous) => [...previous, newContact()]);
                }}
                className="mt-3.5 cursor-pointer border border-bone/[.26] bg-transparent px-3.5 py-[9px] text-[13px] text-bone hover:bg-bone/[.07]"
              >
                + Add row
              </button>
            </div>
          ) : (
            <div>
              <textarea
                value={csv}
                onChange={(event) => {
                  resetApproval();
                  setCsv(event.target.value);
                }}
                placeholder="Marta Reyes, +14155550100"
                className="min-h-[170px] w-full resize-y border border-bone/[.26] bg-panel p-3.5 font-mono text-[13px] leading-[1.7] text-bone outline-none placeholder:text-bone/25"
              />
              <div className="mt-3 flex items-center gap-3.5">
                <button
                  type="button"
                  onClick={() => {
                    resetApproval();
                    setContacts(parseCsv(csv));
                    setEntry("rows");
                  }}
                  disabled={!csvLines}
                  className="cursor-pointer border border-bone/[.26] bg-transparent px-3.5 py-[9px] text-[13px] text-bone hover:bg-bone/[.07] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Parse {csvLines} lines
                </button>
                <span className="text-xs text-bone/40">name, phone — one per line</span>
              </div>
            </div>
          )}
        </div>

        <div className={`mt-10 pt-6 ${RULE}`}>
          <div className={`${KICKER} mb-3`}>03 · Safe execution boundary</div>
          <p className="mb-4 max-w-[660px] text-[13px] leading-6 text-bone/55">
            The first contact is recompiled from the persisted workflow and saved before
            every preview. Previewing never places a call, and execution remains fake by
            default even when a CALL-E key is present.
          </p>
          <button
            type="button"
            onClick={requestPreview}
            disabled={!selectedContact || pending !== null}
            className="inline-flex cursor-pointer items-center gap-2.5 border-0 bg-flame px-5 py-[13px] text-sm font-extrabold text-ink disabled:cursor-not-allowed disabled:opacity-40"
          >
            {pending === "compile-preview"
              ? "Compiling and previewing…"
              : "Compile and preview one call"}
          </button>

          {error ? (
            <div role="alert" className="mt-4 border border-red-400/50 bg-red-950/30 p-3 text-sm text-red-200">
              {error}
            </div>
          ) : null}

          {preview ? (
            <section className="mt-6 border border-bone/[.26] bg-panel p-5">
              <div className="mb-4 flex flex-wrap items-center gap-3">
                <span className="bg-blush px-2 py-1 text-[11px] font-extrabold uppercase tracking-[.1em] text-ink">
                  {preview.mode} mode
                </span>
                <span className="font-mono text-sm text-bone/80">{preview.maskedPhone}</span>
                <span className="text-xs text-bone/45">exactly {preview.callCount} call</span>
              </div>

              <div className={`${KICKER} mb-2`}>Exact task</div>
              <pre className="max-h-56 overflow-auto whitespace-pre-wrap border border-bone/[.16] bg-ink p-3 text-xs leading-5 text-bone/70">
                {preview.task}
              </pre>

              <div className={`${KICKER} mb-2 mt-5`}>Exact result schema</div>
              <pre className="max-h-56 overflow-auto border border-bone/[.16] bg-ink p-3 text-xs leading-5 text-bone/70">
                {JSON.stringify(preview.resultSchema, null, 2)}
              </pre>

              <div className={`${KICKER} mb-2 mt-5`}>Side effects</div>
              <ul className="space-y-1 text-sm text-bone/65">
                {preview.sideEffects.map((effect) => (
                  <li key={effect}>— {effect}</li>
                ))}
              </ul>

              <label className="mt-5 flex cursor-pointer items-start gap-3 text-sm text-bone/75">
                <input
                  type="checkbox"
                  checked={previewApproved}
                  onChange={(event) => setPreviewApproved(event.target.checked)}
                  className="mt-0.5 size-4 accent-[#ff6a3d]"
                />
                I reviewed the exact masked recipient, task, schema, side effects, and one-call count.
              </label>

              {preview.recipientAuthorizationRequired ? (
                <label className="mt-3 flex cursor-pointer items-start gap-3 text-sm text-bone/75">
                  <input
                    type="checkbox"
                    checked={recipientAuthorized}
                    onChange={(event) => setRecipientAuthorized(event.target.checked)}
                    className="mt-0.5 size-4 accent-[#ff6a3d]"
                  />
                  The recipient explicitly authorized this exact test call.
                </label>
              ) : null}

              <button
                type="button"
                onClick={executeCall}
                disabled={!canExecute || pending !== null}
                className="mt-5 cursor-pointer border border-flame bg-transparent px-5 py-3 text-sm font-extrabold text-blush disabled:cursor-not-allowed disabled:opacity-40"
              >
                {pending === "execute"
                  ? "Submitting once…"
                  : preview.mode === "fake"
                    ? "Run fake call"
                    : "Place one live call"}
              </button>
            </section>
          ) : null}

          {execution ? (
            <section className="mt-5 border border-emerald-400/40 bg-emerald-950/20 p-5">
              <div className="text-sm font-extrabold text-emerald-200">
                {execution.mode === "fake" ? "Fake call completed" : "Live call accepted"}
              </div>
              <p className="mt-1 text-xs text-bone/55">
                External side effect: {execution.externalSideEffect ? "yes" : "no"} · status:{" "}
                {execution.status}
              </p>
              <pre className="mt-3 overflow-auto bg-ink p-3 text-xs text-bone/70">
                {JSON.stringify(execution.structuredResult, null, 2)}
              </pre>
            </section>
          ) : null}
        </div>
      </div>
    </main>
  );
}
