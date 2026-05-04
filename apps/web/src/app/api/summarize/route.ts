import { NextResponse } from "next/server";

function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "").replace(/\x1b\][0-9;]*\x07/g, "");
}

export async function POST(req: Request) {
  try {
    const { text } = (await req.json()) as { text?: string };
    if (!text || text.trim().length < 20) {
      return NextResponse.json({ summary: "Waiting for activity..." });
    }

    const clean = stripAnsi(text).slice(-2500);

    const ollamaRes = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "qwen2.5:0.5b",
        system:
          "You are a terse terminal session summarizer. Respond with ONLY a 15-word max summary of what the user is doing. No explanations. No quotes. Just the summary.",
        prompt: clean,
        stream: false,
        options: { temperature: 0.3, num_predict: 40 },
      }),
    });

    if (!ollamaRes.ok) {
      return NextResponse.json({ summary: "Summarizer offline" });
    }

    const data = (await ollamaRes.json()) as { response?: string };
    const summary = data.response?.trim() || "...";
    return NextResponse.json({ summary });
  } catch {
    return NextResponse.json({ summary: "Summarizer error" });
  }
}
