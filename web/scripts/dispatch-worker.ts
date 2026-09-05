/**
 * Standalone RabbitMQ consumer for background call dispatch. Vercel functions are
 * request-scoped and can't host a persistent AMQP consumer, so this runs as its own
 * long-lived process instead, sharing the same lib/db, lib/calle, and lib/campaigns
 * code as the Next.js app.
 *
 * It also serves a trivial HTTP endpoint on $PORT. That's not for handling real
 * traffic — it exists so this can be deployed as a Render free-tier "Web Service"
 * (which requires listening on $PORT) rather than the paid "Background Worker" type,
 * kept awake by an external uptime pinger hitting that endpoint every few minutes so
 * Render's 15-minutes-idle sleep never triggers. Because a free-tier instance can still
 * restart or drop its connection between pings, the AMQP connection reconnects
 * automatically with backoff — messages left unacked by a dropped connection are
 * requeued by RabbitMQ itself and are safe to reprocess (see the ack comment below).
 */
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

import { createServer } from "node:http";
import amqp, { type ChannelModel } from "amqplib";

import { processCallDispatchJob, type CallDispatchJob } from "@/lib/campaigns/dispatch";
import { CALL_DISPATCH_QUEUE } from "@/lib/queue/rabbitmq";

const PREFETCH = 5;
const RECONNECT_BASE_DELAY_MS = 2_000;
const RECONNECT_MAX_DELAY_MS = 30_000;
const PORT = Number(process.env.PORT ?? 8091);

const status: {
  connected: boolean;
  lastError: string | null;
  lastChangeAt: string;
  consecutiveFailures: number;
} = {
  connected: false,
  lastError: null,
  lastChangeAt: new Date().toISOString(),
  consecutiveFailures: 0,
};

function setStatus(patch: Partial<typeof status>): void {
  Object.assign(status, patch, { lastChangeAt: new Date().toISOString() });
}

function requiredUrl(): string {
  const url = process.env.RABBIT_MQ_URL;
  if (!url) {
    throw new Error("RABBIT_MQ_URL is not set — copy .env.example to .env.local and fill it in.");
  }
  return url;
}

let activeConnection: ChannelModel | null = null;
let shuttingDown = false;

/** One connect-and-consume attempt. Resolves only when the connection has closed. */
async function runOnce(): Promise<void> {
  const connection: ChannelModel = await amqp.connect(requiredUrl());
  activeConnection = connection;
  const channel = await connection.createChannel();
  await channel.assertQueue(CALL_DISPATCH_QUEUE, { durable: true });
  await channel.prefetch(PREFETCH);

  setStatus({ connected: true, lastError: null, consecutiveFailures: 0 });
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
        // (A message never reaching this ack because the connection itself dropped mid-
        // processing is the one case RabbitMQ requeues automatically — also safe, for
        // the same idempotency-key reason.)
        try {
          channel.ack(msg);
        } catch {
          // Channel already closed underneath us (connection dropped) — nothing to ack.
        }
      }
    })();
  });

  // Keep this attempt alive until the broker connection actually closes, whether from
  // a clean shutdown, a network drop, or Render restarting the instance.
  await new Promise<void>((resolve) => {
    connection.on("close", () => resolve());
    connection.on("error", (error) => {
      setStatus({ lastError: error instanceof Error ? error.message : String(error) });
    });
  });
  activeConnection = null;
}

/** Reconnects forever with capped exponential backoff. Stops once shutdown() has run. */
async function consumeForever(): Promise<void> {
  while (!shuttingDown) {
    try {
      await runOnce();
      if (shuttingDown) break;
      console.warn("[dispatch-worker] connection closed, reconnecting…");
      setStatus({ connected: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[dispatch-worker] connection attempt failed:", message);
      setStatus({ connected: false, lastError: message, consecutiveFailures: status.consecutiveFailures + 1 });
    }
    if (shuttingDown) break;

    const delay = Math.min(
      RECONNECT_BASE_DELAY_MS * 2 ** status.consecutiveFailures,
      RECONNECT_MAX_DELAY_MS,
    );
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}

function startHealthServer(): ReturnType<typeof createServer> {
  const server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ queue: CALL_DISPATCH_QUEUE, ...status }));
  });
  server.listen(PORT, () => {
    console.log(`[dispatch-worker] health endpoint on :${PORT} (keeps a free-tier host awake)`);
  });
  return server;
}

async function main(): Promise<void> {
  const server = startHealthServer();

  const shutdown = async () => {
    console.log("[dispatch-worker] shutting down");
    shuttingDown = true;
    server.close();
    await activeConnection?.close().catch(() => undefined);
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());

  await consumeForever();
}

main().catch((error: unknown) => {
  console.error("[dispatch-worker] fatal error", error);
  process.exitCode = 1;
});
