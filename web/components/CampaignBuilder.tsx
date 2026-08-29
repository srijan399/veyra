"use client";

import { useCallback, useEffect, useState } from "react";

import type {
  CallResult,
  CampaignLaunchPreview,
  CampaignStatus,
  Contact,
} from "@/types/campaign";

type Entry = "rows" | "csv";
type PendingAction = "preview" | "launch" | null;

const KICKER = "text-[10.5px] uppercase tracking-[.14em] text-bone/50";
const TAB =
  "flex-none cursor-pointer whitespace-nowrap border-0 px-[15px] py-2 text-[12.5px] font-extrabold";
const RULE = "border-t-2 border-bone/[.26]";

let nextId = 0;
const newContact = (name = "", phoneNumber = ""): Contact => ({
  id: `draft-${nextId++}`,
  name,
  phoneNumber,
});

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

function terminal(status: CampaignStatus): boolean {
  return status === "completed" || status === "failed";
}

interface CampaignBuilderProps {
  campaignId: string;
  workflowId: string;
  initialName: string;
  initialContacts: Contact[];
  initialCsv: string;
  stepCount: number;
  initialStatus: CampaignStatus;
  initialResults: CallResult[];
}

export default function CampaignBuilder({
  campaignId,
  workflowId,
  initialName,
  initialContacts,
  initialCsv,
  stepCount,
  initialStatus,
  initialResults,
}: CampaignBuilderProps) {
  const [name, setName] = useState(initialName);
  const [contacts, setContacts] = useState(initialContacts);
  const [entry, setEntry] = useState<Entry>("rows");
  const [csv, setCsv] = useState(initialCsv);
  const [preview, setPreview] = useState<CampaignLaunchPreview | null>(null);
  const [previewApproved, setPreviewApproved] = useState(false);
  const [recipientAuthorized, setRecipientAuthorized] = useState(false);
  const [pending, setPending] = useState<PendingAction>(null);
  const [error, setError] = useState<string | null>(null);
  const [campaignStatus, setCampaignStatus] = useState(initialStatus);
  const [results, setResults] = useState(initialResults);

  const locked = campaignStatus !== "compiled";
  const csvLines = csv.split("\n").filter((line) => line.trim()).length;

  const resetApproval = () => {
    setPreview(null);
    setPreviewApproved(false);
    setRecipientAuthorized(false);
    setError(null);
  };

  const refreshResults = useCallback(async () => {
    const response = await fetch(`/api/campaigns/${campaignId}/results`, {
      cache: "no-store",
    });
    const body: unknown = await response.json();
    if (!response.ok) throw new Error(errorMessage(body));
    const loaded = body as { status?: CampaignStatus; results?: CallResult[] };
    if (loaded.status) setCampaignStatus(loaded.status);
    if (Array.isArray(loaded.results)) setResults(loaded.results);
  }, [campaignId]);

  useEffect(() => {
    if (campaignStatus !== "launching" && campaignStatus !== "launched") return;
    const timer = window.setInterval(() => {
      void refreshResults().catch(() => undefined);
    }, 3_000);
    return () => window.clearInterval(timer);
  }, [campaignStatus, refreshResults]);

  const editContact = (id: string, patch: Partial<Contact>) => {
    resetApproval();
    setContacts((previous) =>
      previous.map((contact) => (contact.id === id ? { ...contact, ...patch } : contact)),
    );
  };

  const requestPreview = async () => {
    setPending("preview");
    setError(null);
    setPreviewApproved(false);
    setRecipientAuthorized(false);

    try {
      const response = await fetch(`/api/campaigns/${campaignId}/preview`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, contacts }),
      });
      const body: unknown = await response.json();
      if (!response.ok) throw new Error(errorMessage(body));
      const loaded = body as { contacts?: Contact[]; preview?: CampaignLaunchPreview };
      if (!Array.isArray(loaded.contacts) || !loaded.preview) {
        throw new Error("The campaign preview response was incomplete.");
      }
      setContacts(loaded.contacts);
      setCsv(loaded.contacts.map((contact) => `${contact.name}, ${contact.phoneNumber}`).join("\n"));
      setPreview(loaded.preview);
    } catch (caught) {
      setPreview(null);
      setError(caught instanceof Error ? caught.message : "The preview failed.");
    } finally {
      setPending(null);
    }
  };

  const launchCampaign = async () => {
    if (!preview || !previewApproved) return;
    setPending("launch");
    setError(null);

    try {
      const response = await fetch(`/api/campaigns/${campaignId}/launch`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          approvalDigest: preview.approvalDigest,
          previewApproved: true,
          recipientAuthorizationConfirmed: recipientAuthorized,
          callCount: preview.callCount,
        }),
      });
      const body: unknown = await response.json();
      if (!response.ok) throw new Error(errorMessage(body));
      setCampaignStatus(preview.mode === "fake" ? "completed" : "launched");
      setPreview(null);
      await refreshResults();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Campaign launch failed.");
    } finally {
      setPending(null);
    }
  };

  const canLaunch =
    previewApproved &&
    (!preview?.recipientAuthorizationRequired || recipientAuthorized) &&
    pending === null;

  return (
    <main className="flex-1 px-6 pb-[72px] pt-[52px] md:px-12">
      <div className="mx-auto max-w-[940px] animate-vfade">
        <div className="mb-6 inline-flex items-center gap-[9px] border border-flame/60 px-[11px] py-1.5 text-[11px] uppercase tracking-[.1em] text-blush">
          <span className="size-1.5 bg-flame" />
          {campaignStatus} · {stepCount} workflow steps · campaign {campaignId.slice(0, 8)}
        </div>
        <a
          href={`/workflow/${workflowId}`}
          className="mb-5 block w-fit text-xs text-bone/45 underline decoration-bone/25 underline-offset-4 hover:text-bone"
        >
          Back to workflow
        </a>

        <h1 className="mb-[34px] text-4xl font-extrabold leading-[1.08] tracking-[-.02em]">
          Launch and follow the campaign.
        </h1>

        <div className={`mb-[34px] pt-[22px] ${RULE}`}>
          <div className={`${KICKER} mb-3`}>01 · Campaign name</div>
          <input
            value={name}
            onChange={(event) => {
              resetApproval();
              setName(event.target.value);
            }}
            disabled={locked}
            maxLength={120}
            className="w-full max-w-[520px] border border-bone/[.26] bg-panel px-3.5 py-3 text-base font-extrabold text-bone outline-none disabled:opacity-50"
          />
        </div>

        <div className={`pt-[22px] ${RULE}`}>
          <div className="mb-3.5 flex items-center justify-between gap-4">
            <div className={`${KICKER} whitespace-nowrap`}>
              02 · Contacts <span className="text-bone/35">({contacts.length}/10)</span>
            </div>
            {!locked ? (
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
            ) : null}
          </div>

          {entry === "rows" || locked ? (
            <div>
              <div className="grid grid-cols-[1fr_1fr_40px] gap-x-3.5 border-b border-bone/[.18] pb-2 text-[10.5px] uppercase tracking-[.12em] text-bone/40">
                <span>Name</span>
                <span>Phone number (strict E.164)</span>
                <span />
              </div>
              {contacts.map((contact) => (
                <div
                  key={contact.id}
                  className="grid grid-cols-[1fr_1fr_40px] items-center gap-x-3.5 border-b border-bone/[.12]"
                >
                  <input
                    value={contact.name}
                    onChange={(event) => editContact(contact.id, { name: event.target.value })}
                    disabled={locked}
                    maxLength={120}
                    placeholder="Name"
                    className="border-0 bg-transparent py-3 text-sm text-bone outline-none placeholder:text-bone/25 disabled:opacity-60"
                  />
                  <input
                    value={contact.phoneNumber}
                    onChange={(event) => editContact(contact.id, { phoneNumber: event.target.value })}
                    disabled={locked}
                    placeholder="+14155550100"
                    className="border-0 bg-transparent py-3 font-mono text-sm text-bone/80 outline-none placeholder:text-bone/25 disabled:opacity-60"
                  />
                  {!locked ? (
                    <button
                      type="button"
                      onClick={() => {
                        resetApproval();
                        setContacts((previous) => previous.filter((item) => item.id !== contact.id));
                      }}
                      aria-label={`Remove ${contact.name || "contact"}`}
                      className="cursor-pointer justify-self-end border-0 bg-transparent p-1 text-[15px] text-bone/35"
                    >
                      ×
                    </button>
                  ) : null}
                </div>
              ))}
              {!locked ? (
                <button
                  type="button"
                  onClick={() => {
                    resetApproval();
                    setContacts((previous) => [...previous, newContact()]);
                  }}
                  disabled={contacts.length >= 10}
                  className="mt-3.5 cursor-pointer border border-bone/[.26] bg-transparent px-3.5 py-[9px] text-[13px] text-bone hover:bg-bone/[.07] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  + Add row
                </button>
              ) : null}
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
                  disabled={!csvLines || csvLines > 10}
                  className="cursor-pointer border border-bone/[.26] bg-transparent px-3.5 py-[9px] text-[13px] text-bone hover:bg-bone/[.07] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Parse {csvLines} lines
                </button>
                <span className="text-xs text-bone/40">name, phone — maximum 10 lines</span>
              </div>
            </div>
          )}
        </div>

        {!locked ? (
          <div className={`mt-10 pt-6 ${RULE}`}>
            <div className={`${KICKER} mb-3`}>03 · Exact campaign preview</div>
            <p className="mb-4 max-w-[700px] text-[13px] leading-6 text-bone/55">
              Every contact is saved and independently compiled. The final approval covers
              every masked recipient, personalized task, result schema, and the exact call count.
              Editing anything invalidates it.
            </p>
            <button
              type="button"
              onClick={requestPreview}
              disabled={!contacts.length || pending !== null}
              className="inline-flex cursor-pointer items-center gap-2.5 border-0 bg-flame px-5 py-[13px] text-sm font-extrabold text-ink disabled:cursor-not-allowed disabled:opacity-40"
            >
              {pending === "preview" ? "Compiling every call…" : "Compile and preview campaign"}
            </button>

            {preview ? (
              <section className="mt-6 border border-bone/[.26] bg-panel p-5">
                <div className="mb-4 flex flex-wrap items-center gap-3">
                  <span className="bg-blush px-2 py-1 text-[11px] font-extrabold uppercase tracking-[.1em] text-ink">
                    {preview.mode} mode
                  </span>
                  <span className="text-sm text-bone/75">exactly {preview.callCount} call{preview.callCount === 1 ? "" : "s"}</span>
                </div>

                <div className="space-y-3">
                  {preview.recipients.map((recipient, index) => (
                    <details key={recipient.contactId} className="border border-bone/[.16] bg-ink p-3">
                      <summary className="cursor-pointer text-sm font-extrabold text-bone/80">
                        {index + 1}. {recipient.name} · <span className="font-mono font-normal">{recipient.maskedPhone}</span>
                      </summary>
                      <div className={`${KICKER} mb-2 mt-4`}>Exact task</div>
                      <pre className="max-h-52 overflow-auto whitespace-pre-wrap text-xs leading-5 text-bone/65">
                        {recipient.task}
                      </pre>
                      <div className={`${KICKER} mb-2 mt-4`}>Exact result schema</div>
                      <pre className="max-h-52 overflow-auto text-xs leading-5 text-bone/65">
                        {JSON.stringify(recipient.resultSchema, null, 2)}
                      </pre>
                    </details>
                  ))}
                </div>

                <div className={`${KICKER} mb-2 mt-5`}>Side effects</div>
                <ul className="space-y-1 text-sm text-bone/65">
                  {preview.sideEffects.map((effect) => <li key={effect}>— {effect}</li>)}
                </ul>

                <label className="mt-5 flex cursor-pointer items-start gap-3 text-sm text-bone/75">
                  <input
                    type="checkbox"
                    checked={previewApproved}
                    onChange={(event) => setPreviewApproved(event.target.checked)}
                    className="mt-0.5 size-4 accent-[#ff6a3d]"
                  />
                  I reviewed every recipient, task, schema, side effect, and the exact {preview.callCount}-call count.
                </label>

                {preview.recipientAuthorizationRequired ? (
                  <label className="mt-3 flex cursor-pointer items-start gap-3 text-sm text-bone/75">
                    <input
                      type="checkbox"
                      checked={recipientAuthorized}
                      onChange={(event) => setRecipientAuthorized(event.target.checked)}
                      className="mt-0.5 size-4 accent-[#ff6a3d]"
                    />
                    The displayed recipient explicitly authorized this exact live test call.
                  </label>
                ) : null}

                <button
                  type="button"
                  onClick={launchCampaign}
                  disabled={!canLaunch}
                  className="mt-5 cursor-pointer border border-flame bg-transparent px-5 py-3 text-sm font-extrabold text-blush disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {pending === "launch"
                    ? "Submitting each call once…"
                    : preview.mode === "fake"
                      ? `Run ${preview.callCount} fake call${preview.callCount === 1 ? "" : "s"}`
                      : "Place one live call"}
                </button>
              </section>
            ) : null}
          </div>
        ) : null}

        {error ? (
          <div role="alert" className="mt-5 border border-red-400/50 bg-red-950/30 p-3 text-sm text-red-200">
            {error}
          </div>
        ) : null}

        {results.length || locked ? (
          <section className={`mt-10 pt-6 ${RULE}`}>
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <div className={`${KICKER} mb-2`}>04 · Durable call results</div>
                <p className="text-[13px] text-bone/55">
                  {terminal(campaignStatus)
                    ? "Every call reached a recorded terminal state."
                    : "Waiting for CALL-E terminal webhooks; this view refreshes automatically."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void refreshResults().catch((caught) => setError(caught.message))}
                className="border border-bone/[.26] bg-transparent px-3 py-2 text-xs text-bone/70"
              >
                Refresh
              </button>
            </div>

            <div className="space-y-3">
              {results.map((result) => {
                const contact = contacts.find((item) => item.id === result.contactId);
                return (
                  <details key={result.id} className="border border-bone/[.18] bg-panel p-4">
                    <summary className="grid cursor-pointer grid-cols-[1fr_auto_auto] items-center gap-4 text-sm">
                      <span className="font-extrabold text-bone">{contact?.name ?? "Unknown contact"}</span>
                      <span className="font-mono text-xs text-bone/50">{result.status}</span>
                      <span className={result.qualified === true ? "text-emerald-300" : "text-bone/45"}>
                        {result.qualified === null ? "—" : result.qualified ? "Qualified" : "Not qualified"}
                      </span>
                    </summary>
                    {result.summary ? <p className="mt-4 text-sm leading-6 text-bone/70">{result.summary}</p> : null}
                    {result.failureMessage ? <p className="mt-4 text-sm text-red-200">{result.failureMessage}</p> : null}
                    <div className={`${KICKER} mb-2 mt-4`}>Structured result</div>
                    <pre className="overflow-auto bg-ink p-3 text-xs text-bone/65">
                      {JSON.stringify(result.capturedData, null, 2)}
                    </pre>
                    {result.transcript ? (
                      <>
                        <div className={`${KICKER} mb-2 mt-4`}>Transcript</div>
                        <pre className="max-h-72 overflow-auto whitespace-pre-wrap bg-ink p-3 text-xs leading-5 text-bone/65">
                          {result.transcript}
                        </pre>
                      </>
                    ) : null}
                    {result.calleCallId ? <div className="mt-3 font-mono text-[11px] text-bone/35">CALL-E {result.calleCallId}</div> : null}
                  </details>
                );
              })}
              {!results.length ? <div className="border border-bone/[.18] p-4 text-sm text-bone/45">Call records are being reserved.</div> : null}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
