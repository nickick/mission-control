import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { PersistedStateSchema, type TerminalConfig, type PageConfig } from "@/lib/schemas";
import { config } from "@/lib/config";
import { extractSshHost } from "@/hooks/useSystemStats";

interface ConfigStore {
  pages: PageConfig[];
  setPages: (pages: PageConfig[]) => void;
  addPage: (page: PageConfig) => void;
  removePage: (pageId: string) => void;
  reorderPages: (fromIndex: number, toIndex: number) => void;
  addTerminal: (pageId: string, terminal: TerminalConfig) => void;
  removeTerminal: (pageId: string, terminalId: string) => void;
  setTerminalName: (pageId: string, terminalId: string, name: string) => void;
  setTerminalCommand: (pageId: string, terminalId: string, command?: string) => void;
  setTerminalStatsHost: (pageId: string, terminalId: string, statsHost?: string) => void;
  setPageName: (pageId: string, name: string) => void;
}

const STORAGE_KEY = "mission-control:config";

function migrateTerminal(t: TerminalConfig): TerminalConfig {
  // Migrate old sshCommand → command + statsHost
  if (t.sshCommand && !t.command) {
    return {
      ...t,
      command: t.sshCommand,
      statsHost: t.statsHost || extractSshHost(t.sshCommand) || undefined,
      sshCommand: undefined,
    };
  }
  return t;
}

function migrateAndValidate(raw: unknown): PageConfig[] {
  // Try Zod first
  const parsed = PersistedStateSchema.safeParse(raw);
  if (parsed.success) {
    return parsed.data.pages.map((page) => ({
      ...page,
      terminals: page.terminals.map(migrateTerminal),
    }));
  }

  // If Zod fails, try loose migration from any shape
  if (raw && typeof raw === "object" && "pages" in raw && Array.isArray(raw.pages)) {
    const looselyMigrated = raw.pages.map((page: unknown) => {
      if (page && typeof page === "object" && "terminals" in page && Array.isArray(page.terminals)) {
        return {
          ...(page as Record<string, unknown>),
          terminals: (page.terminals as TerminalConfig[]).map(migrateTerminal),
        } as PageConfig;
      }
      return page as PageConfig;
    });
    const revalidated = PersistedStateSchema.safeParse({ pages: looselyMigrated });
    if (revalidated.success) return revalidated.data.pages;
  }

  return config.pages;
}

export const useConfigStore = create<ConfigStore>()(
  persist(
    (set) => ({
      pages: config.pages,

      setPages: (pages) => set({ pages }),

      addPage: (page) =>
        set((state) => ({
          pages: [...state.pages, page],
        })),

      removePage: (pageId) =>
        set((state) => ({
          pages: state.pages.filter((p) => p.id !== pageId),
        })),

      addTerminal: (pageId, terminal) =>
        set((state) => ({
          pages: state.pages.map((page) =>
            page.id === pageId
              ? { ...page, terminals: [...page.terminals, terminal] }
              : page
          ),
        })),

      removeTerminal: (pageId, terminalId) =>
        set((state) => ({
          pages: state.pages.map((page) =>
            page.id === pageId
              ? { ...page, terminals: page.terminals.filter((t) => t.id !== terminalId) }
              : page
          ),
        })),

      setTerminalCommand: (pageId, terminalId, command) =>
        set((state) => ({
          pages: state.pages.map((page) =>
            page.id === pageId
              ? {
                  ...page,
                  terminals: page.terminals.map((t) =>
                    t.id === terminalId ? { ...t, command, sshCommand: undefined } : t
                  ),
                }
              : page
          ),
        })),

      setTerminalStatsHost: (pageId, terminalId, statsHost) =>
        set((state) => ({
          pages: state.pages.map((page) =>
            page.id === pageId
              ? {
                  ...page,
                  terminals: page.terminals.map((t) =>
                    t.id === terminalId ? { ...t, statsHost } : t
                  ),
                }
              : page
          ),
        })),

      setTerminalName: (pageId, terminalId, name) =>
        set((state) => ({
          pages: state.pages.map((page) =>
            page.id === pageId
              ? {
                  ...page,
                  terminals: page.terminals.map((t) =>
                    t.id === terminalId ? { ...t, name } : t
                  ),
                }
              : page
          ),
        })),

      setPageName: (pageId, name) =>
        set((state) => ({
          pages: state.pages.map((page) =>
            page.id === pageId ? { ...page, name } : page
          ),
        })),

      reorderPages: (fromIndex, toIndex) =>
        set((state) => {
          if (
            fromIndex === toIndex ||
            fromIndex < 0 ||
            fromIndex >= state.pages.length ||
            toIndex < 0 ||
            toIndex >= state.pages.length
          ) {
            return state;
          }
          const pages = [...state.pages];
          const [moved] = pages.splice(fromIndex, 1);
          pages.splice(toIndex, 0, moved);
          return { pages };
        }),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ pages: state.pages }),
      skipHydration: true,
      onRehydrateStorage: () => (state) => {
        if (state) {
          const validPages = migrateAndValidate({ pages: state.pages });
          state.setPages(validPages);
        }
      },
    }
  )
);
