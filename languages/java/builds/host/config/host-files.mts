import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { containedPath } from '../../../../../shared/paths/contained-path.mjs';
import { HOST_MAIN_CLASS } from './host-config.mts';
import { attempt, valueOr } from '../../../../../shared/values/attempt/attempt.mts';

const SIGNAL_ALIVE = 0;
export const SOCKET = '.sock';
export const READY = '.ready';
export const BUSY = '.busy';
const HOST_FILES = [SOCKET, READY, BUSY];
const PS_TIMEOUT_MS = 10_000;
const LEASE = '.lease-';
const PROC = '/proc';

function insideDirectory(dir: string, name: string): string {
  return containedPath(path.resolve(dir), name, {
    outside: (outside: string) => `${outside} is not inside the hosts directory`,
  });
}

export function hostFile(dir: string, key: string, suffix: string): string {
  return insideDirectory(dir, `${key}${suffix}`);
}

export function hostPid(dir: string, key: string): number | undefined {
  const text = valueOr(() => readFileSync(hostFile(dir, key, READY), 'utf8'), '');
  const pid = Number.parseInt(text, 10);
  return Number.isInteger(pid) ? pid : undefined;
}

export function isAlive(pid: number | undefined): boolean {
  if (pid === undefined) {
    return false;
  }
  return attempt(() => process.kill(pid, SIGNAL_ALIVE)).ok;
}

function procCommand(pid: number): string {
  const file = path.resolve(PROC, String(pid), 'cmdline');
  if (!file.startsWith(PROC + path.sep)) {
    return '';
  }
  return readFileSync(file, 'utf8');
}

function commandOf(pid: number): string {
  const proc = attempt(() => procCommand(pid));
  if (proc.ok) {
    return proc.value;
  }
  const listed = spawnSync('ps', ['-o', 'command=', '-p', String(pid)], {
    encoding: 'utf8',
    timeout: PS_TIMEOUT_MS,
  });
  return listed.status === 0 ? listed.stdout : '';
}

export function isHostProcess(pid: number | undefined): boolean {
  return pid !== undefined && isAlive(pid) && commandOf(pid).includes(HOST_MAIN_CLASS);
}

export function forgetHost(dir: string, key: string): void {
  for (const suffix of HOST_FILES) {
    rmSync(hostFile(dir, key, suffix), { force: true });
  }
}

export function stopHost(dir: string, key: string): void {
  const pid = hostPid(dir, key);
  if (pid !== undefined && isHostProcess(pid) && !attempt(() => process.kill(pid, 'SIGKILL')).ok) {
    rmSync(hostFile(dir, key, READY), { force: true });
  }
  forgetHost(dir, key);
}

export function takeLease(dir: string, key: string): string {
  const lease = insideDirectory(dir, `${key}${LEASE}${String(process.pid)}`);
  writeFileSync(lease, '');
  return lease;
}

export function isLeased(dir: string, key: string): boolean {
  let leased = false;
  for (const name of readdirSync(dir).filter((entry) => entry.startsWith(`${key}${LEASE}`))) {
    const pid = Number.parseInt(name.slice(`${key}${LEASE}`.length), 10);
    if (isAlive(pid)) {
      leased = true;
    } else {
      rmSync(insideDirectory(dir, name), { force: true });
    }
  }
  return leased;
}

export function readyAge(dir: string, key: string): number {
  return statSync(hostFile(dir, key, READY), { throwIfNoEntry: false })?.mtimeMs ?? 0;
}
