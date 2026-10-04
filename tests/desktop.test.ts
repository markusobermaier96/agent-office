// The desktop app's host: the office behind the Electron window. It must come up without a terminal,
// take a free port when the one it was given is busy, and hand out a one-time sign-in link.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadConfig } from '../src/server/config.js';
import { officeUrl, openDesktop, type DesktopOffice } from '../src/server/desktop/host.js';

let tmp = '';
let office: DesktopOffice | undefined;
let takenPort = 0;
let blocker: net.Server | undefined;

/** A port something else is listening on, so the host has to find another one. */
function busyPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    blocker = net.createServer();
    blocker.once('error', reject);
    blocker.listen(0, '127.0.0.1', () => resolve((blocker!.address() as net.AddressInfo).port));
  });
}

before(async () => {
  tmp = mkdtempSync(path.join(tmpdir(), 'agent-office-desktop-'));
  const home = path.join(tmp, 'home');
  const publicDir = path.join(tmp, 'public');
  mkdirSync(home, { recursive: true });
  mkdirSync(publicDir, { recursive: true });
  // A client bundle of its own, so the test needn't build one (as server-dispatch.test.ts does).
  for (const page of ['index', 'login', 'claim', 'join', 'lite']) writeFileSync(path.join(publicDir, `${page}.html`), `<!doctype html><title>${page}</title>`);
  for (const k of Object.keys(process.env)) if (k.startsWith('AGENT_OFFICE_')) delete process.env[k];
  takenPort = await busyPort();
  const cfg = loadConfig(['--home', home, '--port', String(takenPort), '--password', 'desktop-test', '--no-open']);
  office = await openDesktop(cfg, { publicDir });
});

after(() => {
  office?.shutdown();
  blocker?.close();
  if (tmp) rmSync(tmp, { recursive: true, force: true });
});

test('a port someone else has is skipped for a free one', () => {
  assert.ok(office);
  assert.notEqual(office.port, takenPort);
});

test('the host hands the app a one-time sign-in link at the office', async () => {
  assert.ok(office);
  assert.match(office.url, /^http:\/\/localhost:\d+\/login#key=[\w-]+$/);
  assert.equal(office.port, Number(new URL(office.url).port));
  const res = await fetch(`http://localhost:${office.port}/login.html`);
  assert.equal(res.status, 200);
});

test('the window address is the office sign-in link on loopback', () => {
  assert.equal(officeUrl('http', 4600, '/login#key=abc'), 'http://localhost:4600/login#key=abc');
  assert.equal(officeUrl('https', 8443, '/login#key=abc'), 'https://localhost:8443/login#key=abc');
});
