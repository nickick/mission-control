export interface TerminalConfig {
  id: string;
  name: string;
  shell: string;
  command?: string;
  /** @deprecated Use command + statsHost instead */
  sshCommand?: string;
  statsHost?: string;
  cwd?: string;
  env?: Record<string, string>;
}

export interface PageConfig {
  id: string;
  name: string;
  terminals: TerminalConfig[];
}

export interface AppConfig {
  pages: PageConfig[];
  shortcuts: Record<string, string>;
}

export type WSMessage =
  | { type: 'input'; data: string }
  | { type: 'output'; data: string }
  | { type: 'resize'; cols: number; rows: number }
  | { type: 'spawn'; sessionId?: string; shell: string; args?: string[]; cwd?: string; env?: Record<string, string> }
  | { type: 'kill' }
  | { type: 'write'; data: string }
  | { type: 'spawned'; pid: number }
  | { type: 'exit'; exitCode: number; signal?: string }
  | { type: 'error'; message: string };
