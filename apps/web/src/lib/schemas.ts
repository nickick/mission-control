import { z } from "zod";

export const TerminalConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  shell: z.string(),
  command: z.string().optional(),
  // @deprecated kept for backward compatibility during migration
  sshCommand: z.string().optional(),
  statsHost: z.string().optional(),
  cwd: z.string().optional(),
  env: z.record(z.string(), z.string()).optional(),
});

export const PageConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string().optional(),
  terminals: z.array(TerminalConfigSchema),
});

export const PersistedStateSchema = z.object({
  pages: z.array(PageConfigSchema),
  repoRoots: z.record(z.string(), z.array(z.string())).optional(),
});

export type TerminalConfig = z.infer<typeof TerminalConfigSchema>;
export type PageConfig = z.infer<typeof PageConfigSchema>;
export type PersistedState = z.infer<typeof PersistedStateSchema>;
