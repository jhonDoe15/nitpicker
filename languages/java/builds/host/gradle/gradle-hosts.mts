import { mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fieldOf, numberOr, parseJson } from '../../../../../shared/values/readers.mts';
import { attempt, valueOr } from '../../../../../shared/values/attempt/attempt.mts';
import { HOST_PROGRAM } from '../../../maven/programs/tool-host-program.mts';
import { readPinnedTools } from '../../java-build.mts';
import { privateDirectory } from '../client/host-client.mts';
import { HOST_CONFIG_FILE, readHostConfig } from '../config/host-config.mts';
import { affordableHosts, compiledHost, stopAllHosts, warnOff } from '../session/host-session.mts';

export type GradleHosts = {
  readonly arguments: readonly string[];
  readonly stop: () => void;
};
export type GradleHostsRequest = {
  readonly timeoutMs: number;
  readonly warn: { readonly write: (text: string) => unknown };
};
export type PendingHosts = {
  readonly owner: number;
  readonly maxHosts: number;
  readonly timeoutMs: number;
};

export const PENDING_FILE = 'pending.json';
export const HOSTS_PROPERTY = 'nitpicker.toolHosts';
const NO_HOSTS: GradleHosts = { arguments: [], stop: () => undefined };

export function readPendingHosts(directory: string): PendingHosts | undefined {
  const value: unknown = valueOr(
    (): unknown => parseJson(readFileSync(path.join(directory, PENDING_FILE), 'utf8')),
    undefined,
  );
  const owner = fieldOf(value, 'owner');
  const maxHosts = fieldOf(value, 'maxHosts');
  return typeof owner === 'number' && typeof maxHosts === 'number'
    ? { owner, maxHosts, timeoutMs: numberOr(fieldOf(value, 'timeoutMs'), 0) }
    : undefined;
}

function close(directory: string): void {
  attempt(() => {
    stopAllHosts(directory);
  });
  attempt(() => {
    rmSync(directory, { recursive: true, force: true });
  });
}

function open(maxHosts: number, timeoutMs: number): GradleHosts {
  const directory = mkdtempSync(path.join(tmpdir(), 'nitpicker-hosts-'));
  const pending: PendingHosts = { owner: process.pid, maxHosts, timeoutMs };
  try {
    writeFileSync(path.join(directory, PENDING_FILE), JSON.stringify(pending));
  } catch (error) {
    close(directory);
    throw error;
  }
  return {
    arguments: [`-P${HOSTS_PROPERTY}=${directory}`],
    stop() {
      close(directory);
    },
  };
}

export function openGradleHosts({ timeoutMs, warn }: GradleHostsRequest): GradleHosts {
  const maxHosts = affordableHosts(warn);
  if (maxHosts === undefined) {
    return NO_HOSTS;
  }
  const opened = attempt(() => open(maxHosts, timeoutMs));
  if (opened.ok) {
    return opened.value;
  }
  warnOff(opened.error, warn);
  return NO_HOSTS;
}

export type Preparation = {
  readonly directory: string;
  readonly libraries: readonly string[];
  readonly java: string;
};

export function prepareGradleHosts({ directory, libraries, java }: Preparation): void {
  if (readHostConfig(directory) !== undefined) {
    return;
  }
  const pending = readPendingHosts(directory);
  if (pending === undefined || !privateDirectory(directory)) {
    throw new Error(`${directory} is not a tool host directory of this run`);
  }
  const { classpath } = compiledHost({
    work: directory,
    tools: { effects: libraries },
    pinned: readPinnedTools(),
    program: HOST_PROGRAM,
    java,
  });
  const staging = path.join(directory, `${HOST_CONFIG_FILE}.${String(process.pid)}`);
  writeFileSync(
    staging,
    JSON.stringify({ owner: pending.owner, classpath, maxHosts: pending.maxHosts }),
  );
  renameSync(staging, path.join(directory, HOST_CONFIG_FILE));
}
