import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import os from "os";

// SQLite log of every summarization call — one row per Gemini request with
// exact token counts, inspectable later:
//   sqlite3 ~/.mission-control/summary-usage.db 'SELECT * FROM summary_usage'

const DB_DIR = path.join(os.homedir(), ".mission-control");
const DB_FILE = path.join(DB_DIR, "summary-usage.db");

const GLOBAL_KEY = Symbol.for("mission-control.usageDb");
const globalAny = globalThis as { [GLOBAL_KEY]?: Database.Database };

function getDb(): Database.Database {
  if (!globalAny[GLOBAL_KEY]) {
    fs.mkdirSync(DB_DIR, { recursive: true });
    const db = new Database(DB_FILE);
    db.pragma("journal_mode = WAL");
    db.exec(`
      CREATE TABLE IF NOT EXISTS summary_usage (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        at INTEGER NOT NULL,
        session_id TEXT,
        model TEXT NOT NULL,
        input_tokens INTEGER NOT NULL,
        output_tokens INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_summary_usage_at ON summary_usage(at);
      CREATE INDEX IF NOT EXISTS idx_summary_usage_session ON summary_usage(session_id);
    `);
    globalAny[GLOBAL_KEY] = db;
  }
  return globalAny[GLOBAL_KEY];
}

export function logUsage(
  sessionId: string | null,
  model: string,
  inputTokens: number,
  outputTokens: number,
  at = Date.now()
) {
  getDb()
    .prepare(
      "INSERT INTO summary_usage (at, session_id, model, input_tokens, output_tokens) VALUES (?, ?, ?, ?, ?)"
    )
    .run(at, sessionId, model, inputTokens, outputTokens);
}

export interface UsageTotals {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  since: number | null;
}

export function usageTotals(sinceMs?: number): UsageTotals {
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS calls,
              COALESCE(SUM(input_tokens), 0) AS inputTokens,
              COALESCE(SUM(output_tokens), 0) AS outputTokens,
              MIN(at) AS since
       FROM summary_usage
       ${sinceMs !== undefined ? "WHERE at >= ?" : ""}`
    )
    .get(...(sinceMs !== undefined ? [sinceMs] : [])) as UsageTotals;
  return row;
}

export function usageLogIsEmpty(): boolean {
  const row = getDb().prepare("SELECT COUNT(*) AS n FROM summary_usage").get() as { n: number };
  return row.n === 0;
}
