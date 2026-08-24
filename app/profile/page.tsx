import Link from "next/link";
import { redirect } from "next/navigation";

import StepHeader from "@/components/StepHeader";
import { initialsFor } from "@/lib/initials";
import { getSessionUser } from "@/lib/supabase/auth";
import {
  SAMPLE_PROFILE_STATS,
  SAMPLE_SAVED_WORKFLOWS,
  type SavedWorkflow,
} from "@/lib/sample-profile";

const EYEBROW = "text-[10.5px] uppercase tracking-[.14em] text-bone/45";

function Stat({
  label,
  value,
  sub,
  last = false,
}: {
  label: string;
  value: string;
  sub: string;
  last?: boolean;
}) {
  return (
    <div className={`px-[34px] py-7 ${last ? "" : "border-r border-bone/[.18]"}`}>
      <div className={`${EYEBROW} mb-2.5`}>{label}</div>
      <div className="text-[38px] font-extrabold leading-none tracking-[-.03em] text-bone">
        {value}
      </div>
      <div className="mt-2 text-xs text-bone/40">{sub}</div>
    </div>
  );
}

function WorkflowCard({ workflow: w }: { workflow: SavedWorkflow }) {
  const compiled = w.state === "Compiled";

  return (
    <div className="flex flex-col gap-3.5 border-b border-r border-bone/[.14] px-[22px] pb-[18px] pt-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="mb-1.5 text-[10px] uppercase tracking-[.14em] text-ember">
            {w.vertical}
          </div>
          <div className="text-[17px] font-extrabold leading-tight tracking-[-.01em] text-bone">
            {w.name}
          </div>
        </div>
        <span
          className={`flex-none px-2 py-1 text-[10px] font-extrabold uppercase tracking-[.08em] ${
            compiled
              ? "bg-flame/[.14] text-blush"
              : "border border-bone/[.22] text-bone/45"
          }`}
        >
          {w.state}
        </span>
      </div>

      <p className="text-[12.5px] leading-[1.55] text-bone/55">{w.goal}</p>

      {/* Activity sparkline. Decorative, so it is hidden from assistive tech rather than
          announced as a row of empty elements. */}
      <div aria-hidden className="flex h-6 items-end gap-0.5">
        {w.spark.map((h, i) => (
          <span
            key={i}
            className={compiled ? "flex-1 bg-flame/60" : "flex-1 bg-bone/25"}
            style={{ height: `${Math.max(h * 100, 6)}%` }}
          />
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2.5 border-t border-bone/[.14] pt-3 text-[11px] text-bone">
        {[
          ["Steps", String(w.steps)],
          ["Calls", w.calls.toLocaleString()],
          ["Qualified", w.qualRate],
        ].map(([label, value]) => (
          <span key={label}>
            <span className="mb-[3px] block text-[9.5px] uppercase tracking-[.08em] text-bone/40">
              {label}
            </span>
            <span className="font-extrabold">{value}</span>
          </span>
        ))}
      </div>

      <div className="mt-auto flex items-center gap-2">
        <Link
          href="/campaign"
          className={`px-3.5 py-[9px] text-[12.5px] font-extrabold no-underline ${
            compiled
              ? "bg-flame text-ink"
              : "pointer-events-none border border-bone/[.18] text-bone/30"
          }`}
          aria-disabled={!compiled}
          tabIndex={compiled ? undefined : -1}
        >
          Prepare for CALL-E
        </Link>
        <Link
          href="/workflow"
          className="border border-bone/[.26] px-3.5 py-[9px] text-[12.5px] font-extrabold text-bone no-underline"
        >
          Open editor
        </Link>
        <span className="ml-auto text-[11px] text-bone/35">{w.updated}</span>
      </div>
    </div>
  );
}

export default async function ProfilePage() {
  const user = await getSessionUser();

  // The middleware already guards /profile, so this only fires if a request somehow
  // reaches the page without a session. Cheap, and it keeps `user` non-null below.
  if (!user) redirect("/auth/login?next=/profile");

  const compiledCount = SAMPLE_SAVED_WORKFLOWS.filter(
    (w) => w.state === "Compiled",
  ).length;
  const draftCount = SAMPLE_SAVED_WORKFLOWS.length - compiledCount;

  return (
    <div className="flex min-h-screen flex-col bg-ink">
      <StepHeader current="profile" />

      <main className="flex-1 pb-[72px]">
        <div className="flex flex-wrap items-end justify-between gap-6 border-b-2 border-bone/[.26] px-[34px] pb-[22px] pt-[34px]">
          <div className="flex items-end gap-[18px]">
            <span className="grid size-16 place-items-center border border-bone/[.26] bg-bone/10 text-xl font-extrabold tracking-[.04em] text-bone">
              {initialsFor(user.fullName, user.email)}
            </span>
            <div>
              <div className={`${EYEBROW} mb-[5px]`}>Account</div>
              <h1 className="mb-1 text-3xl font-extrabold tracking-[-.01em] text-bone">
                {user.fullName ?? user.email}
              </h1>
              <div className="text-[13px] text-bone/50">
                {user.companyName ? `${user.companyName} · ` : ""}
                {user.email}
              </div>
            </div>
          </div>

          <Link
            href="/"
            className="inline-flex flex-none items-center gap-[9px] whitespace-nowrap bg-flame px-[17px] py-3 text-[13.5px] font-extrabold text-ink no-underline"
          >
            New workflow from prompt
          </Link>
        </div>

        <div className="grid grid-cols-1 border-b-2 border-bone/[.26] sm:grid-cols-3">
          <Stat
            label="Saved workflows"
            value={String(SAMPLE_SAVED_WORKFLOWS.length)}
            sub={`${compiledCount} compiled, ${draftCount} draft`}
          />
          <Stat
            label="Campaigns run"
            value={SAMPLE_PROFILE_STATS.campaignsRun.value}
            sub={SAMPLE_PROFILE_STATS.campaignsRun.sub}
          />
          <Stat
            label="Calls placed"
            value={SAMPLE_PROFILE_STATS.callsPlaced.value}
            sub={SAMPLE_PROFILE_STATS.callsPlaced.sub}
            last
          />
        </div>

        <div className="flex flex-wrap items-baseline justify-between gap-4 px-[34px] pb-3.5 pt-[26px]">
          <div className="text-[10.5px] uppercase tracking-[.14em] text-bone/50">
            Saved workflows{" "}
            <span className="text-bone/35">({SAMPLE_SAVED_WORKFLOWS.length})</span>
          </div>
          <div className="text-xs text-bone/40">
            Compiled workflows go straight to CALL-E without a new prompt
          </div>
        </div>

        <div className="grid grid-cols-[repeat(auto-fill,minmax(340px,1fr))] border-t border-bone/[.18]">
          {SAMPLE_SAVED_WORKFLOWS.map((w) => (
            <WorkflowCard key={w.id} workflow={w} />
          ))}
        </div>
      </main>
    </div>
  );
}
