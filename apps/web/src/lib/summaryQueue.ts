import { Queue, Worker } from "bullmq";
import { summarizeWithGemini, type SummaryMeta } from "@/lib/summarizeGemini";
import { setCachedSummary } from "@/lib/summaryStore";

// BullMQ queue + worker for summarization. The worker enforces a global cap
// of MAX_PER_MINUTE Gemini calls; jobs are deduped per terminal via
// jobId === sessionId, so each terminal has at most one pending summary.

const QUEUE_NAME = "terminal-summaries";
const MAX_PER_MINUTE = 5;
export const NORMAL_PRIORITY = 10;
export const URGENT_PRIORITY = 1;

export interface SummaryJobData {
  sessionId: string;
  text: string;
  contentHash: string;
  meta?: SummaryMeta;
}

// Bump whenever the worker's processing behavior changes — the singleton
// survives dev-server HMR with stale closures otherwise.
const QUEUE_VERSION = 2;

interface QueueState {
  queue: Queue<SummaryJobData>;
  worker: Worker<SummaryJobData>;
  version?: number;
}

function redisConnection() {
  const url = new URL(process.env.REDIS_URL ?? "redis://127.0.0.1:6379");
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    maxRetriesPerRequest: null,
  };
}

// One queue/worker per process, surviving Next.js dev-server module reloads.
const GLOBAL_KEY = Symbol.for("mission-control.summaryQueue");
const globalAny = globalThis as { [GLOBAL_KEY]?: QueueState };

function getQueueState(): QueueState {
  const existing = globalAny[GLOBAL_KEY];
  if (existing && existing.version !== QUEUE_VERSION) {
    // Stale worker from a previous module version — retire it so jobs are
    // processed by the current code.
    existing.worker.close().catch(() => {});
    existing.queue.close().catch(() => {});
    globalAny[GLOBAL_KEY] = undefined;
  }
  if (!globalAny[GLOBAL_KEY]) {
    const connection = redisConnection();
    const queue = new Queue<SummaryJobData>(QUEUE_NAME, { connection });
    const worker = new Worker<SummaryJobData>(
      QUEUE_NAME,
      async (job) => {
        const fresh = await summarizeWithGemini(
          job.data.text,
          job.data.contentHash,
          job.data.sessionId,
          job.data.meta
        );
        if (fresh) {
          await setCachedSummary(job.data.sessionId, fresh);
        }
        return fresh?.summary ?? null;
      },
      {
        connection,
        concurrency: 1,
        limiter: { max: MAX_PER_MINUTE, duration: 60_000 },
      }
    );
    worker.on("error", () => {
      // Redis hiccups shouldn't crash the dev server; BullMQ reconnects.
    });
    globalAny[GLOBAL_KEY] = { queue, worker, version: QUEUE_VERSION };
  }
  return globalAny[GLOBAL_KEY];
}

export interface EnqueueResult {
  queued: boolean;
  promoted: boolean;
  created: boolean;
}

const PENDING_STATES = new Set(["waiting", "prioritized", "delayed", "waiting-children"]);

export async function enqueueSummary(
  sessionId: string,
  text: string,
  contentHash: string,
  urgent: boolean,
  meta?: SummaryMeta
): Promise<EnqueueResult> {
  const { queue } = getQueueState();

  const existing = await queue.getJob(sessionId);
  if (existing) {
    const state = await existing.getState();
    if (PENDING_STATES.has(state)) {
      // Refresh the snapshot so the eventual summary reflects current output.
      await existing.updateData({ sessionId, text, contentHash, meta });
      if (urgent) {
        if (state === "delayed") await existing.promote();
        await existing.changePriority({ priority: URGENT_PRIORITY });
      }
      return { queued: true, promoted: urgent, created: false };
    }
    if (state === "active") {
      return { queued: true, promoted: false, created: false };
    }
  }

  await queue.add(
    "summarize",
    { sessionId, text, contentHash, meta },
    {
      jobId: sessionId,
      priority: urgent ? URGENT_PRIORITY : NORMAL_PRIORITY,
      removeOnComplete: true,
      removeOnFail: true,
      attempts: 2,
      backoff: { type: "fixed", delay: 10_000 },
    }
  );
  return { queued: true, promoted: urgent, created: true };
}

export async function getQueueCounts() {
  try {
    const { queue } = getQueueState();
    const counts = await queue.getJobCounts("waiting", "prioritized", "active", "delayed");
    return {
      pending: (counts.waiting ?? 0) + (counts.prioritized ?? 0) + (counts.delayed ?? 0),
      active: counts.active ?? 0,
    };
  } catch {
    return { pending: 0, active: 0 };
  }
}
