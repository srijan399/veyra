import assert from "node:assert/strict";
import test from "node:test";

import {
  CampaignLifecycleError,
  parseCampaignLaunchApproval,
  parseCampaignPreviewInput,
  prepareCampaignLaunch,
} from "../lib/campaigns/lifecycle";
import type { SafeCallDraft } from "../lib/calle/safety";
import type { Contact } from "../types/campaign";

const campaignId = "11111111-1111-4111-8111-111111111111";
const contacts: Contact[] = [
  {
    id: "22222222-2222-4222-8222-222222222222",
    name: "Marta Reyes",
    phoneNumber: "+14155550100",
  },
  {
    id: "33333333-3333-4333-8333-333333333333",
    name: "Daniel Osei",
    phoneNumber: "+14155550101",
  },
];

function draft(contact: Contact): SafeCallDraft {
  return {
    phone: contact.phoneNumber,
    task: `Identify yourself as an AI and ask ${contact.name} for permission to continue.`,
    resultSchema: {
      type: "object",
      properties: { qualified: { type: "boolean" } },
      required: ["qualified"],
      additionalProperties: false,
    },
    metadata: { campaignId, contactId: contact.id },
  };
}

test("campaign input rejects duplicate recipients and unknown controls", () => {
  assert.throws(
    () =>
      parseCampaignPreviewInput({
        name: "Inbound leads",
        contacts: [contacts[0], { ...contacts[1], phoneNumber: contacts[0].phoneNumber }],
      }),
    (error: unknown) =>
      error instanceof CampaignLifecycleError &&
      error.issues.some((issue) => issue.includes("duplicates another recipient")),
  );
  assert.throws(
    () => parseCampaignPreviewInput({ name: "Inbound leads", contacts, automaticRetry: true }),
    CampaignLifecycleError,
  );
});

test("campaign approval is stable and covers every personalized call", async () => {
  const input = {
    userId: "user-1",
    campaignId,
    mode: "fake" as const,
    calls: contacts.map((contact) => ({ contact, draft: draft(contact) })),
  };
  const first = await prepareCampaignLaunch(input);
  const second = await prepareCampaignLaunch(input);

  assert.equal(first.preview.callCount, 2);
  assert.equal(first.preview.approvalDigest, second.preview.approvalDigest);
  assert.equal(first.calls.length, 2);
  assert.match(first.calls[0].callResultId, /^[0-9a-f-]{36}$/);
  assert.equal(
    first.calls[0].draft.metadata?.veyraCallResultId,
    first.calls[0].callResultId,
  );

  const changed = await prepareCampaignLaunch({
    ...input,
    calls: [
      input.calls[0],
      {
        ...input.calls[1],
        draft: { ...input.calls[1].draft, task: `${input.calls[1].draft.task} Ask one more question.` },
      },
    ],
  });
  assert.notEqual(first.preview.approvalDigest, changed.preview.approvalDigest);
});

test("live campaigns remain limited to one explicitly authorized recipient", async () => {
  await assert.rejects(
    () =>
      prepareCampaignLaunch({
        userId: "user-1",
        campaignId,
        mode: "live",
        calls: contacts.map((contact) => ({ contact, draft: draft(contact) })),
      }),
    /limited to one explicitly authorized test recipient/,
  );
});

test("launch approval requires exact count and explicit confirmation fields", () => {
  const parsed = parseCampaignLaunchApproval({
    approvalDigest: "a".repeat(64),
    previewApproved: true,
    recipientAuthorizationConfirmed: false,
    callCount: 2,
  });
  assert.equal(parsed.callCount, 2);
  assert.throws(
    () => parseCampaignLaunchApproval({ ...parsed, callCount: 0 }),
    CampaignLifecycleError,
  );
});
