import { CalleClient } from "@call-e/calle";
import { NextRequest, NextResponse } from "next/server";

const client = new CalleClient({
  apiKey: process.env.CALLE_API_KEY!,
  baseUrl: process.env.CALLE_BASE_URL ?? "https://api.heycall-e.com",
});

export async function POST(req: NextRequest) {
  const { phone, task } = await req.json();

  if (!phone) {
    return NextResponse.json({ error: "phone is required (E.164 format)" }, { status: 400 });
  }

  const completed = await client.calls.createAndWait(
    {
      task: task ?? "Call and ask whether they can attend Friday lunch in Tripti bar.",
      recipients: [{ phones: [phone] }],
      resultSchema: {
        type: "object",
        required: ["attending_count"],
        properties: {
          attending_count: { type: "integer" },
        },
      },
      recipientResultSchema: {
        type: "object",
        required: ["can_attend"],
        properties: {
          can_attend: { type: "string", enum: ["yes", "no", "unknown"] },
        },
      },
    },
    { timeoutMs: 120_000, intervalMs: 2_000 },
  );

  return NextResponse.json(completed);
}
