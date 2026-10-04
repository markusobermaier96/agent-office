# The Windows desktop app

Back to the [README](../README.md).

Agent Office as an ordinary Windows application: an installer puts **Agent Office** in the Start
menu, and double-clicking it opens the office in its own window instead of in a browser. It is the
same office, on the same data — the app starts the server as a child process and shows it — so this
page is only about building and running the window.

## What the app is

- **One window around the office.** The Electron app starts `dist/server/server/desktop/index.js`,
  the office's desktop entry, and shows the one-time sign-in link it answers with. There is no
  terminal to keep open and no browser tab.
- **The office still runs on Node.** The app starts the entry with `ELECTRON_RUN_AS_NODE=1`, so the
  Electron binary behaves as Node for the office and for everything it spawns: agent hooks, the
  workers' MCP server and the terminal host all call `process.execPath`, and they all land back on
  Node. Nothing of the office runs in the renderer, and `node-pty`'s N-API prebuilds work as they do
  under plain Node.
- **The same data and settings as the CLI.** The app uses `~/agent-office` (or `AGENT_OFFICE_HOME`),
  so projects, workers and sign-ins are shared with an office you run with the `agent-office`
  command. Pass the CLI's own flags and they go to the office: `Agent Office.exe --home D:\office`.
- **A free port.** It listens on 4600 like the CLI, and if that port is taken it quietly takes any
  free one instead of refusing to open.
- **Voice and screen sharing work.** `http://localhost` counts as a secure origin, and the app grants
  the microphone and screen-capture permissions the page asks for.

Because it is the same office, the machine still needs everything the CLI needs: **Node.js 20+** and
at least one agent CLI (Claude Code, Codex, OpenCode, …), plus **git** and the **GitHub CLI** for
cloning and the boards. See [Requirements](../README.md#requirements).

## Run it from a checkout

```bash
npm install
npm run desktop      # builds the client and server, then opens the Electron window
```

`npm run desktop` is the fastest loop while working on the app: it builds and starts the window
against your checkout, with the office's console output in the terminal.

## Build the Windows installer

```bash
npm run dist:win
```

That builds the client and server and runs `electron-builder` ([electron-builder.yml](../electron-builder.yml)),
which writes to `release/`:

- `Agent-Office-<version>-win-x64.exe` — the installer (per-user, so no administrator prompt; it can
  choose its folder, and makes Start-menu and desktop shortcuts).
- `Agent-Office-<version>-win-x64.zip` — the same app unpacked, to run without installing.

Build on Windows. `node-pty` installs a prebuilt binary per platform, so a Windows package needs the
Windows one, and `electron-builder`'s Windows targets want a Windows runner. The `desktop` workflow
does exactly this on GitHub's `windows-latest` and uploads `release/*.exe` and `release/*.zip` as an
artifact; `npm run dist:win` does the same on your own Windows machine.

## What the app does when it starts

1. It starts the office child process, which opens in `~/agent-office`.
2. It shows the office at the sign-in link, already signed in. From then on the window is the office.
3. Closing the window stops the office the way **Ctrl+C** does — workers' terminals are closed, not
   left running. (The office's **⬆️ Upgrade the office** and a restart keep them; closing the app
   does not.)

There is no first-start walkthrough in the app, because there is no terminal for it. The office
starts with no floors and the elevator asks for your first project, exactly as it does when you
skip the CLI walkthrough.
