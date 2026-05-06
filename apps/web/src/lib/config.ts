import type { AppConfig } from "@mission-control/types";

export const config: AppConfig = {
  pages: [
    {
      id: "page-1",
      name: "Shells",
      terminals: [],
    },
    {
      id: "page-2",
      name: "Servers",
      terminals: [],
    },
  ],
  shortcuts: {
    nextPage: "cmd+opt+right / ctrl+shift+right",
    prevPage: "cmd+opt+left / ctrl+shift+left",
    focusUp: "ctrl+up",
    focusDown: "ctrl+down",
    focusLeft: "ctrl+left",
    focusRight: "ctrl+right",
    respawn: "ctrl+shift+r",
    injectCommand: "ctrl+enter",
  },
};
