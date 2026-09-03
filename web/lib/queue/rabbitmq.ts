import "server-only";

import amqp from "amqplib";

/**
 * Background call dispatch. Queue name kept in one place so the API routes that publish
 * and the standalone worker (scripts/dispatch-worker.ts) that consumes always agree.
 */
export const CALL_DISPATCH_QUEUE = "veyra.call-dispatch";

async function createChannel() {
  const url = process.env.RABBIT_MQ_URL;
  if (!url) {
    throw new Error(
      "RABBIT_MQ_URL is not set. Copy the CloudAMQP URL into web/.env.local — see web/.env.example.",
    );
  }
  const connection = await amqp.connect(url);
  const channel = await connection.createChannel();
  await channel.assertQueue(CALL_DISPATCH_QUEUE, { durable: true });
  return channel;
}

// Lazily connect once per warm serverless instance rather than per request.
let channelPromise: ReturnType<typeof createChannel> | undefined;

function getChannel() {
  if (!channelPromise) channelPromise = createChannel();
  return channelPromise;
}

export async function publishCallDispatch(job: unknown): Promise<void> {
  const channel = await getChannel();
  channel.sendToQueue(CALL_DISPATCH_QUEUE, Buffer.from(JSON.stringify(job)), {
    persistent: true,
    contentType: "application/json",
  });
}
