// The Windows node-pty binary, so `npm run dist:win` can package a working Windows app on Ubuntu.
//
// npm installs node-pty's prebuilt binary for the host platform only, and electron-builder copies
// whichever ones it finds in node_modules. Packaging for Windows from a non-Windows machine
// therefore has to fetch the Windows one first, at the version @lydell/node-pty asks for. On
// Windows it is already there and this does nothing.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.join(import.meta.dirname, '..');
const WIN_PTY = '@lydell/node-pty-win32-x64';

if (process.platform === 'win32' || existsSync(path.join(root, 'node_modules', WIN_PTY))) {
  process.exit(0);
}

const pty = JSON.parse(readFileSync(path.join(root, 'node_modules', '@lydell', 'node-pty', 'package.json'), 'utf8'));
const version = pty.optionalDependencies?.[WIN_PTY];
if (!version) throw new Error(`@lydell/node-pty no longer offers ${WIN_PTY}; update desktop/win-pty.mjs`);

console.log(`fetching ${WIN_PTY}@${version} for the Windows package`);
execFileSync('npm', ['install', '--no-save', '--force', '--ignore-scripts', `${WIN_PTY}@${version}`], { cwd: root, stdio: 'inherit' });
