// The desktop app's entry point. desktop/main.cjs (Electron) starts this as a child process with
// ELECTRON_RUN_AS_NODE=1, so the Electron binary is Node here and every `process.execPath` spawn
// inside the office (agent hooks, the MCP server, the terminal host) runs Node too. It tells the app
// where the office is over the parent's IPC channel, then waits to be asked to close.
import { openDesktop, type DesktopReady } from './host.js';

type ToApp = DesktopReady | { type: 'failed'; message: string };

/** No parent to tell (someone ran it by hand): the console line is enough. */
const send = (msg: ToApp) => {
  try {
    process.send?.(msg);
  } catch {
    // The app is already gone; nothing to tell.
  }
};

let office: Awaited<ReturnType<typeof openDesktop>>;
try {
  office = await openDesktop();
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  send({ type: 'failed', message });
  console.error(`agent-office desktop: ${message}`);
  process.exit(1);
}

send({ type: 'ready', url: office.url, port: office.port });
console.log(`\n  🏢  agent-office is open at ${office.url}\n`);

let closing = false;
// The app asks over IPC when its window closes. SIGTERM is there for a plain `node dist/.../desktop`.
const stop = () => {
  if (closing) return;
  closing = true;
  office.shutdown();
  setTimeout(() => process.exit(0), 300);
};
process.on('message', (msg: unknown) => {
  if (msg && typeof msg === 'object' && (msg as { type?: string }).type === 'quit') stop();
});
// The app died without asking (its process was killed): stop rather than linger as an orphan.
process.on('disconnect', stop);
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
// Last line of defense: one bad request must never take down every running worker (as in cli.ts).
process.on('unhandledRejection', (err) => console.error('agent-office desktop: unhandled rejection', err));
