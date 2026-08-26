"use client";

import { useState } from "react";
import type { Contact } from "@/types/campaign";

type Entry = "rows" | "csv";

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

/** "Marta Reyes, +1 415 555 0182" per line. */
function parseCsv(csv: string): Contact[] {
  return csv
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => {
      const [name, phone] = line.split(",");
      return newContact((name ?? "").trim(), (phone ?? "").trim());
    });
}

interface CampaignBuilderProps {
  initialName: string;
  initialContacts: Contact[];
  initialCsv: string;
  /** Number of nodes in the compiled workflow, shown in the compiled badge. */
  stepCount: number;
  compiledAt: string;
}

export default function CampaignBuilder({
  initialName,
  initialContacts,
  initialCsv,
  stepCount,
  compiledAt,
}: CampaignBuilderProps) {
  const [name, setName] = useState(initialName);
  const [contacts, setContacts] = useState(initialContacts);
  const [entry, setEntry] = useState<Entry>("rows");
  const [csv, setCsv] = useState(initialCsv);

  const csvLines = csv.split("\n").filter((l) => l.trim()).length;
  const estMinutes = Math.max(2, Math.round(contacts.length * 1.4));

  const editContact = (id: string, patch: Partial<Contact>) =>
    setContacts((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    );

  const launch = () => {
    if (!contacts.length) return;
    // TODO: POST /api/campaigns then /api/campaigns/[id]/launch, which creates one
    // idempotent Calls API request per contact, then move to the Results step.
    console.log({ name, contacts });
  };

  return (
    <main className="flex-1 px-12 pb-[72px] pt-[52px]">
      <div className="mx-auto max-w-[840px] animate-vfade">
        <div className="mb-6 inline-flex items-center gap-[9px] whitespace-nowrap border border-flame/60 px-[11px] py-1.5 text-[11px] uppercase tracking-[.1em] text-blush">
          <span className="size-1.5 bg-flame" />
          Workflow compiled · ready to call · {stepCount} steps · {compiledAt}
        </div>

        <h1 className="mb-[34px] text-4xl font-extrabold leading-[1.08] tracking-[-.02em]">
          Set up the campaign.
        </h1>

        {/* — 01 campaign name — */}
        <div className={`mb-[34px] pt-[22px] ${RULE}`}>
          <div className={`${KICKER} mb-3`}>01 · Campaign name</div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full max-w-[520px] border border-bone/[.26] bg-panel px-3.5 py-3 text-base font-extrabold text-bone outline-none"
          />
        </div>

        {/* — 02 contacts — */}
        <div className={`pt-[22px] ${RULE}`}>
          <div className="mb-3.5 flex items-center justify-between gap-4">
            <div className={`${KICKER} whitespace-nowrap`}>
              02 · Contacts <span className="text-bone/35">({contacts.length})</span>
            </div>
            <div className="flex border border-bone/[.26]">
              {(["rows", "csv"] as const).map((v, i) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setEntry(v)}
                  className={`${TAB} ${i === 0 ? "border-r border-bone/[.26]" : ""} ${
                    entry === v ? "bg-flame text-ink" : "bg-transparent text-bone"
                  }`}
                >
                  {v === "rows" ? "Add rows" : "Paste CSV"}
                </button>
              ))}
            </div>
          </div>

          {entry === "rows" ? (
            <div>
              <div className="grid grid-cols-[1fr_1fr_40px] gap-x-3.5 border-b border-bone/[.18] pb-2 text-[10.5px] uppercase tracking-[.12em] text-bone/40">
                <span>Name</span>
                <span>Phone number</span>
                <span />
              </div>

              {contacts.map((c) => (
                <div
                  key={c.id}
                  className="grid grid-cols-[1fr_1fr_40px] items-center gap-x-3.5 border-b border-bone/[.12]"
                >
                  <input
                    value={c.name}
                    onChange={(e) => editContact(c.id, { name: e.target.value })}
                    placeholder="Name"
                    className="border-0 bg-transparent py-3 text-sm text-bone outline-none placeholder:text-bone/25"
                  />
                  <input
                    value={c.phoneNumber}
                    onChange={(e) =>
                      editContact(c.id, { phoneNumber: e.target.value })
                    }
                    placeholder="+1 415 555 0182"
                    className="border-0 bg-transparent py-3 text-sm text-bone/80 outline-none placeholder:text-bone/25"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setContacts((prev) => prev.filter((x) => x.id !== c.id))
                    }
                    aria-label={`Remove ${c.name || "contact"}`}
                    className="cursor-pointer justify-self-end border-0 bg-transparent p-1 text-[15px] text-bone/35"
                  >
                    ×
                  </button>
                </div>
              ))}

              <button
                type="button"
                onClick={() => setContacts((prev) => [...prev, newContact()])}
                className="mt-3.5 cursor-pointer border border-bone/[.26] bg-transparent px-3.5 py-[9px] text-[13px] text-bone hover:bg-bone/[.07]"
              >
                + Add row
              </button>
            </div>
          ) : (
            <div>
              <textarea
                value={csv}
                onChange={(e) => setCsv(e.target.value)}
                placeholder="Marta Reyes, +1 415 555 0182"
                className="min-h-[170px] w-full resize-y border border-bone/[.26] bg-panel p-3.5 font-mono text-[13px] leading-[1.7] text-bone outline-none placeholder:text-bone/25"
              />
              <div className="mt-3 flex items-center gap-3.5">
                <button
                  type="button"
                  onClick={() => {
                    setContacts(parseCsv(csv));
                    setEntry("rows");
                  }}
                  disabled={!csvLines}
                  className="cursor-pointer border border-bone/[.26] bg-transparent px-3.5 py-[9px] text-[13px] text-bone hover:bg-bone/[.07] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Parse {csvLines} lines
                </button>
                <span className="text-xs text-bone/40">
                  name, phone — one per line
                </span>
              </div>
            </div>
          )}
        </div>

        {/* — launch — */}
        <div className={`mt-10 flex items-center gap-[18px] pt-6 ${RULE}`}>
          <button
            type="button"
            onClick={launch}
            disabled={!contacts.length}
            className="inline-flex cursor-pointer items-center gap-2.5 whitespace-nowrap border-0 bg-flame px-5 py-[13px] text-sm font-extrabold text-ink disabled:cursor-not-allowed disabled:opacity-40"
          >
            Launch Campaign
          </button>
          <span className="text-[12.5px] text-bone/45">
            {contacts.length} individual calls, one placed per contact · est.{" "}
            {estMinutes} min
          </span>
        </div>
      </div>
    </main>
  );
}
