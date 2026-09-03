/**
 * Standalone RabbitMQ consumer for background call dispatch. Run alongside `pnpm dev`
 * (`pnpm worker`) — Vercel functions are request-scoped and can't host a persistent AMQP
 * consumer, so this runs as its own long-lived process instead, sharing the same
 * lib/db, lib/calle, and lib/campaigns code as the Next.js app.
 */
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

import amqp from "amqplib";

import { processCallDispatchJob, type CallDispatchJob } from "@/lib/campaigns/dispatch";
import { CALL_DISPATCH_QUEUE } from "@/lib/queue/rabbitmq";

const PREFETCH = 5;

async function main(): Promise<void> {
  const url = process.env.RABBIT_MQ_URL;
  if (!url) {
    throw new Error("RABBIT_MQ_URL is not set — copy .env.example to .env.local and fill it in.");
  }

  const connection = await amqp.connect(url);
  const channel = await connection.createChannel();
  await channel.assertQueue(CALL_DISPATCH_QUEUE, { durable: true });
  await channel.prefetch(PREFETCH);

  console.log(`[dispatch-worker] listening on "${CALL_DISPATCH_QUEUE}"`);

  await channel.consume(CALL_DISPATCH_QUEUE, (msg) => {
    if (!msg) return;
    void (async () => {
      try {
        const job = JSON.parse(msg.content.toString("utf8")) as CallDispatchJob;
        await processCallDispatchJob(job);
      } catch (error) {
        // processCallDispatchJob already records failures it can attribute to a call
        // (recordSubmissionFailure); this only catches a malformed message itself, which
        // has no call to attribute the failure to. Acked either way — see below.
        console.error("[dispatch-worker] failed to process message", error);
      } finally {
        // Always ack: recordSubmissionFailure already turned a failed call into a
        // terminal, visible "submission_uncertain" state, so redelivering it would just
        // reprocess a call CALL-E's idempotency key already protects against duplicating.
        channel.ack(msg);
      }
    })();
  });

  const shutdown = async () => {
    console.log("[dispatch-worker] shutting down");
    await channel.close().catch(() => undefined);
    await connection.close().catch(() => undefined);
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error: unknown) => {
  console.error("[dispatch-worker] fatal error", error);
  process.exitCode = 1;
});
