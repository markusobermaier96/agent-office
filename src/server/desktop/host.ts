// The office behind the desktop app: what desktop/main.cjs (Electron) starts as a child process and
// shows in a window. It is cli.ts's startup without the terminal, the welcome walkthrough or the
// browser, and the piece that turns a preferred port into one that is actually free.
import net, { type AddressInfo } from 'node:net';
import { loadConfig, type Config } from '../config.js';
import { startServer, type StartOptions } from '../server.js';

/** What the app is told once the office answers. The window opens `url`, which signs it in once. */
export interface DesktopReady {
  type: 'ready';
  url: string;
  port: number;
}

export interface DesktopOffice {
  url: string;
  port: number;
  /** Stops the office the way Ctrl+C does: workers' terminals are closed, not left running. */
  shutdown(): void;
}

/** The window's address: the office's one-time sign-in link, on this machine. */
export function officeUrl(scheme: string, port: number, signInLink: string): string {
  return `${scheme}://localhost:${port}${signInLink}`;
}

/** `port`, or a free one when something else already has it. */
function freePort(port: number, host: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', (err) => {
      if ((err as NodeJS.ErrnoException).code === 'EADDRINUSE' && port !== 0) resolve(freePort(0, host));
      else reject(err);
    });
    probe.listen(port, host, () => {
      const chosen = (probe.address() as AddressInfo).port;
      probe.close(() => resolve(chosen));
    });
  });
}

/**
 * Starts the office for the desktop app: the port the config asks for, or any free one if that is
 * taken. Refusing to open the window because 4600 was busy would be no use to an app.
 */
export async function openDesktop(cfg: Config = loadConfig(process.argv.slice(2)), opts: StartOptions = {}): Promise<DesktopOffice> {
  cfg.port = await freePort(cfg.port, cfg.host);
  const office = await startServer(cfg, opts);
  const address = office.server.address() as AddressInfo | null;
  const port = address?.port ?? cfg.port;
  cfg.port = port;
  return { url: officeUrl(cfg.tls ? 'https' : 'http', port, office.signInLink()), port, shutdown: office.shutdown };
}
