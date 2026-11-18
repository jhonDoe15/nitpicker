import { type ChildProcess, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readReusePart, withSharedUsage } from '../../adapters/reuse/jvm-reuse-facts.mts';
import type { ReusePart } from '../../adapters/reuse/jvm-reuse-types.mts';
import type { JavaFinding, JavaPolicy } from '../../adapters/typed/java-values.mts';
import { checkoutModuleUrl } from '../../../../shared/paths/checkout-module.mjs';
import { withCompileCache } from '../../../../shared/processes/environment.mts';
import { fieldOf } from '../../../../shared/values/readers.mts';
import {
  REQUEST_FILE,
  RESULT_FILE,
  STATUS_FILE,
  HEARTBEAT_FILE,
  SILENCE_LIMIT_MS,
  reusePartOf,
} from './reuse-files.mts';
import { requestOf, reuseRequest, sourceStamps } from './reuse-request.mts';

type Launch = (folder: string) => ChildProcess;
type Started = {
  readonly folder: string;
  readonly child: ChildProcess;
  readonly since: number;
};
type Settled = { readonly part: ReusePart | undefined; readonly failure?: unknown };
type WideOptions = {
  readonly projects: readonly unknown[];
  readonly kotlin: boolean;
  readonly policy: JavaPolicy;
};

const PROCESS = fileURLToPath(
  checkoutModuleUrl(new URL('reuse-ahead-process.mjs', import.meta.url)),
);
const POLL_MS = 50;
const started = new Map<string, Started>();

export function launchReuseProcess(folder: string): ChildProcess {
  return spawn(process.execPath, [PROCESS, String(process.pid), folder], {
    stdio: 'ignore',
    env: withCompileCache(process.env),
  });
}

export function startReuseAhead(request: string, launch: Launch = launchReuseProcess): void {
  if (started.has(request)) {
    return;
  }
  const folder = mkdtempSync(path.join(tmpdir(), 'nitpicker-reuse-'));
  writeFileSync(path.join(folder, REQUEST_FILE), request);
  const child = launch(folder);
  child.on('error', () => undefined);
  child.unref();
  started.set(request, { folder, child, since: Date.now() });
}

function stop({ folder, child }: Started): void {
  if (child.exitCode === null && child.signalCode === null) {
    child.kill();
  }
  rmSync(folder, { recursive: true, force: true });
}

export function stopReuseAhead(): void {
  for (const run of started.values()) {
    stop(run);
  }
  started.clear();
}

function pause(milliseconds: number): void {
  Atomics.wait(
    new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT)),
    0,
    0,
    milliseconds,
  );
}

function isRunning({ folder, since }: Started): boolean {
  const beat = path.join(folder, HEARTBEAT_FILE);
  const last = existsSync(beat) ? statSync(beat).mtimeMs : since;
  return Date.now() - last < SILENCE_LIMIT_MS;
}

function awaitStatus(run: Started): boolean {
  const status = path.join(run.folder, STATUS_FILE);
  while (!existsSync(status) && isRunning(run)) {
    pause(POLL_MS);
  }
  return existsSync(status) && fieldOf(JSON.parse(readFileSync(status, 'utf8')), 'code') === 0;
}

function readResult(folder: string, request: string): ReusePart | undefined {
  const result: unknown = JSON.parse(readFileSync(path.join(folder, RESULT_FILE), 'utf8'));
  const stamps = JSON.stringify(fieldOf(result, 'stamps'));
  if (stamps !== JSON.stringify(sourceStamps(request))) {
    return undefined;
  }
  return reusePartOf(fieldOf(result, 'part'));
}

export function takeReuseAhead(request: string): ReusePart | undefined {
  const run = started.get(request);
  started.delete(request);
  stopReuseAhead();
  if (run === undefined) {
    return undefined;
  }
  try {
    return settled(run, request).part;
  } finally {
    stop(run);
  }
}

function settled(run: Started, request: string): Settled {
  try {
    return { part: awaitStatus(run) ? readResult(run.folder, request) : undefined };
  } catch (error) {
    return { part: undefined, failure: error };
  }
}

export function computeReusePart(request: string): ReusePart {
  const { projectRoot, ...options } = requestOf(request);
  return readReusePart(projectRoot, options);
}

function storedPart(part: ReusePart): ReusePart | undefined {
  return reusePartOf(JSON.parse(JSON.stringify(part)));
}

export function jvmReuseAhead(
  projectRoot: string,
  options: WideOptions,
): { findings: JavaFinding[]; imports: unknown } {
  const request = reuseRequest(projectRoot, options);
  const part = takeReuseAhead(request) ?? computeReusePart(request);
  return withSharedUsage(storedPart(part) ?? part, options);
}
