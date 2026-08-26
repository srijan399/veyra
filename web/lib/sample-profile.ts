/**
 * Stand-in data for the account screen's saved-workflow grid, until workflows are stored
 * in Supabase.
 *
 * SWAP POINT: once `/api/workflows` lands, app/profile/page.tsx should select the caller's
 * own rows instead of importing this — RLS scopes them to the signed-in user, so the query
 * needs no explicit user filter. The user's name, company and initials on that screen are
 * already real; only these cards are fake.
 */

export type SavedWorkflowState = "Compiled" | "Draft";

export interface SavedWorkflow {
  id: string;
  name: string;
  vertical: string;
  state: SavedWorkflowState;
  goal: string;
  steps: number;
  calls: number;
  /** Already formatted for display — "38%", or "—" when nothing has run yet. */
  qualRate: string;
  updated: string;
  /** Relative bar heights, 0 to 1, for the little activity sparkline on each card. */
  spark: number[];
}

export const SAMPLE_SAVED_WORKFLOWS: SavedWorkflow[] = [
  {
    id: "w1",
    name: "Wealth Enquiry Qualifier",
    vertical: "Wealth management",
    state: "Compiled",
    goal: "Qualify inbound enquiries on goals, horizon and risk tolerance, then book an advisor consultation.",
    steps: 8,
    calls: 412,
    qualRate: "38%",
    updated: "Updated 2h ago",
    spark: [0.5, 0.8, 0.4, 0.9, 0.6, 1, 0.7, 0.85],
  },
  {
    id: "w2",
    name: "Renewal Cover Check",
    vertical: "Insurance",
    state: "Compiled",
    goal: "Confirm cover and property details before renewal, flag underinsured households to a broker.",
    steps: 6,
    calls: 1043,
    qualRate: "24%",
    updated: "Updated 3d ago",
    spark: [0.3, 0.5, 0.45, 0.7, 0.5, 0.6, 0.9, 0.55],
  },
  {
    id: "w3",
    name: "Course Guide Follow-up",
    vertical: "Education",
    state: "Draft",
    goal: "Follow up guide downloads, capture programme and start date, check funding, book admissions.",
    steps: 7,
    calls: 0,
    qualRate: "—",
    updated: "Updated 6d ago",
    spark: [0.2, 0.25, 0.2, 0.3, 0.2, 0.25, 0.2, 0.3],
  },
  {
    id: "w4",
    name: "Dormant Account Reactivation",
    vertical: "Wealth management",
    state: "Compiled",
    goal: "Reach clients inactive for twelve months, understand what changed, route live interest to an advisor.",
    steps: 9,
    calls: 236,
    qualRate: "31%",
    updated: "Updated 2w ago",
    spark: [0.6, 0.4, 0.7, 0.5, 0.8, 0.45, 0.65, 0.5],
  },
];

/** Lifetime totals shown in the three-up stat row. Also placeholder. */
export const SAMPLE_PROFILE_STATS = {
  campaignsRun: { value: "17", sub: "across 3 verticals" },
  callsPlaced: { value: "1,691", sub: "lifetime on CALL-E" },
};
