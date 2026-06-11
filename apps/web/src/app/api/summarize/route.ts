import { NextResponse } from "next/server";
import {
  getCachedSummary,
  getUsageStats,
  hashContent,
  shouldRefresh,
  MIN_CONTENT_CHARS,
} from "@/lib/summaryStore";
import { API_KEYS } from "@/lib/summarizeGemini";
import { enqueueSummary, getQueueCounts } from "@/lib/summaryQueue";

function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "").replace(/\x1b\][0-9;]*\x07/g, "");
}

export async function GET() {
  const [usage, queue] = await Promise.all([getUsageStats(), getQueueCounts()]);
  return NextResponse.json({ ...usage, queue });
}

export async function POST(req: Request) {
  try {
    const { text, sessionId, urgent, meta } = (await req.json()) as {
      text?: string;
      sessionId?: string;
      urgent?: boolean;
      meta?: { name?: string; command?: string; directory?: string };
    };

    if (!sessionId) {
      return NextResponse.json({ summary: "Missing sessionId" }, { status: 400 });
    }

    const clean = stripAnsi(text ?? "").slice(-12000);
    const contentHash = hashContent(clean);
    const cached = await getCachedSummary(sessionId);

    let queued = false;
    let promoted = false;
    if (API_KEYS.length > 0 && clean.length >= MIN_CONTENT_CHARS) {
      // The button bypasses the time gate but never re-summarizes content
      // that produced the cached summary. Normal refreshes are gated by the
      // per-session interval; the worker's limiter caps global throughput.
      const contentIsNew = cached?.contentHash !== contentHash;
      const due = urgent ? contentIsNew : await shouldRefresh(sessionId, contentHash, clean.length);
      if (due) {
        const result = await enqueueSummary(sessionId, clean, contentHash, Boolean(urgent), meta);
        queued = result.queued;
        promoted = result.promoted;
      }
    }

    const usage = await getUsageStats();
    if (cached) {
      return NextResponse.json({ ...cached, cached: true, queued, promoted, usage });
    }
    return NextResponse.json({
      summary: API_KEYS.length === 0 ? "Summarizer not configured" : "Waiting for activity...",
      queued,
      promoted,
      usage,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Summarizer error";
    return NextResponse.json({ summary: "Summarizer error", error: message });
  }
}
