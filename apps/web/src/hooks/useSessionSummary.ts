"use client";

import { useEffect, useRef, useState } from "react";

export function useSessionSummary(outputBufferRef: React.MutableRefObject<string[]>) {
  const [summary, setSummary] = useState("Waiting for activity...");
  const lastHashRef = useRef("");
  const lastSummaryRef = useRef("Waiting for activity...");

  useEffect(() => {
    const interval = setInterval(async () => {
      const buffer = outputBufferRef.current;
      const text = buffer.join("");

      // Skip if too little content
      if (text.length < 50) return;

      // Skip if buffer hasn't changed meaningfully
      const hash = text.length + "|" + text.slice(-200);
      if (hash === lastHashRef.current) return;
      lastHashRef.current = hash;

      try {
        const res = await fetch("/api/summarize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });
        const data = (await res.json()) as { summary?: string };
        if (data.summary) {
          lastSummaryRef.current = data.summary;
          setSummary(data.summary);
        }
      } catch {
        // keep previous summary on error
      }
    }, 12000);

    return () => clearInterval(interval);
  }, [outputBufferRef]);

  return summary;
}
