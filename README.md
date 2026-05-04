# Mission Control

A web-based terminal multiplexer for managing multiple shell sessions from a single browser window. Built with Next.js, Express, node-pty, and xterm.js.

![Architecture](https://user-images.githubusercontent.com/placeholder/mission-control-arch.png)

## Features

- **Multi-page tabs** — Organize terminals into named tabs (e.g. "Shells", "Servers")
- **3-column grid layout** — Up to 3 terminals per row, with `+` placeholders to add more
- **WebSocket PTY** — Full interactive terminal emulation via node-pty in the browser
- **Command auto-injection** — Set a command per terminal that auto-runs on spawn / refresh
- **Remote system stats** — Per-column stats strips showing CPU, RAM, and disk from local or remote hosts via SSH
- **Session summarization** — Optional Ollama-powered summary of recent terminal activity
- **Keyboard-driven** — Full shortcut support for navigation, spawning, and injecting commands
- **Persistent state** — Page/tab layout and terminal config survives reloads via localStorage
- **Drag-and-drop** — Reorder pages by dragging tabs

## Architecture

```
┌─────────────┐      WebSocket       ┌─────────────────┐
│  Browser    │ ◄──────────────────► │  Express Server │
│  (Next.js)  │   JSON msg protocol  │   (port 3001)   │
└─────────────┘                      └─────────────────┘
     │                                       │
     │  xterm.js                             │  node-pty
     │                                       │
     └───────────────────────────────────────┘
                    PTY I/O
```

- **`apps/web`** — Next.js 15 frontend with xterm.js terminals
- **`apps/server`** — Express server handling WebSocket PTY sessions and stats API
- **`packages/types`** — Shared TypeScript types between web and server

## Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [pnpm](https://pnpm.io/) 8+
- macOS or Linux (node-pty v0.10.1 requires native compilation)
- (Optional) [Ollama](https://ollama.com/) for terminal session summarization
- (Optional) SSH key-based access to remote hosts for remote stats

## Setup

```bash
# Install dependencies
pnpm install

# Start the dev stack (runs port cleanup + turbo TUI)
pnpm dev
```

This starts:
- Web UI on http://localhost:3000
- PTY server on ws://localhost:3001/pty + http://localhost:3001/stats

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + Shift + T` | New terminal modal |
| `Cmd/Ctrl + Shift + R` | Set command / stats source for focused terminal |
| `Cmd/Ctrl + R` | Respawn + clear focused terminal |
| `Cmd/Ctrl + Enter` | Re-inject the terminal's configured command |
| `Ctrl + Shift + ←/→` | Switch page tabs |
| `Ctrl + ←/→` | Focus previous/next terminal |
| `Ctrl + 1-9` | Jump to page N |
| `Double-click tab` | Rename page |

## Terminal Configuration

Each terminal stores:

| Field | Description |
|-------|-------------|
| `name` | Display label in the header |
| `shell` | `/bin/zsh`, `/bin/bash`, or `/bin/sh` |
| `command` | Command to auto-run on spawn / refresh |
| `statsHost` | System stats source: local or a remote SSH host |

### Stats Sources

The stats endpoint (`GET /stats?host=<ssh-host>`) collects CPU, memory, and disk usage. Set `statsHost` to:
- **Local** — Read from the machine running the Express server
- **Remote** — SSH into a Linux host and read `/proc/loadavg`, `/proc/meminfo`, `/proc/stat`, and `df`

Remote stats require passwordless SSH (key-based auth) from the server machine to the target host.

### Summarization

If Ollama is running locally, each terminal's recent output is summarized every 12 seconds and shown in the terminal header. The summarizer sends the last ~2500 characters of terminal output to a local LLM (default: `qwen2.5:0.5b`).

To disable: remove or modify `apps/web/src/app/api/summarize/route.ts`.

## Development Notes

- **node-pty version**: Locked to `0.10.1`. v1.x fails on macOS with `posix_spawnp failed`.
- **SSH TTY allocation**: The app spawns an interactive login shell and types the command after the prompt, rather than using `ssh -t <cmd>` which fails TTY allocation in node-pty.
- **Keep-alive**: Terminals stay alive across page switches (rendered with `display: none` rather than unmounted).
- **SSR**: Terminal components are client-only via `dynamic({ ssr: false })` to avoid hydration mismatches.

## Project Structure

```
.
├── apps/
│   ├── server/          # Express + node-pty + WebSocket
│   └── web/             # Next.js 15 + xterm.js
├── packages/
│   └── types/           # Shared TypeScript types
├── scripts/
│   └── kill-ports.mjs   # Cleanup utility for dev startup
├── package.json         # pnpm workspace root
└── turbo.json           # Turborepo config
```

## License

MIT
