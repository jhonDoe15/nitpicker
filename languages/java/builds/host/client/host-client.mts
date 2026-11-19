import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSyncWithOutputFile } from '../../../../../core/tooling/output-file/output-file.mjs';
import { checkoutModuleUrl } from '../../../../../shared/paths/checkout-module.mjs';
import { fieldOf, numberOr, textOf } from '../../../../../shared/values/readers.mts';
import type { JavaSpawn } from '../../../adapters/typed/java-values.mts';
import { toolHeapFlags } from '../../../maven/parallel/tool-slots.mts';
import { probeJava } from '../../../maven/programs/probe/java-probe-cache.mts';
import {
  HOSTED_TOOLS,
  type HostedTool,
  HOST_RELEASE,
  hostedTool,
  hostsDirectory,
  readHostConfig,
  socketFits,
} from '../config/host-config.mts';
import { hostEnvironment } from '../config/host-environment.config.mts';
import { stopHost } from '../config/host-files.mts';
import { traceHosting } from '../config/host-trace.mts';
import { attempt } from '../../../../../shared/values/attempt/attempt.mts';

export type HostedRun = {
  readonly java?: string | undefined;
  readonly jvmArgs?: readonly string[] | undefined;
  readonly classpath?: readonly string[] | undefined;
  readonly mainClass?: string | undefined;
  readonly args: readonly string[];
  readonly cwd: string;
};

const CONNECT_SCRIPT = fileURLToPath(
  checkoutModuleUrl(new URL('host-connect.mjs', import.meta.url)),
);
const KEY_LENGTH = 12;
const CONNECT_GRACE_MS = 60_000;
const MAX_REPLY_BYTES = 256 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000;
const CLASSPATH_SEPARATOR = '\u001f';
const VERSION = /version "(?:1\.)?(\d+)/u;
const PLAIN_OPTIONS = ['cwd', 'encoding', 'maxBuffer', 'timeout'];
const SIZING = /^-Xmx|^-XX:(?:Max|Initial|Min)RAMPercentage=/u;
const OTHERS_ACCESS = 0o077;
const PATH_PIECES = /[,=;:]/u;

function namesExistingRelativePath(piece: string, cwd: string): boolean {
  if (piece === '' || piece.startsWith('-') || path.isAbsolute(piece)) {
    return false;
  }
  const full = path.resolve(cwd, piece);
  if (!full.startsWith(`${path.resolve(cwd)}${path.sep}`)) {
    return true;
  }
  return existsSync(full);
}

export function hasRelativePath(args: readonly string[], cwd: string): boolean {
  return args.some((argument) =>
    argument.split(PATH_PIECES).some((piece) => namesExistingRelativePath(piece, cwd)),
  );
}

export function onlyPlainOptions(options: object, extra: readonly string[] = []): boolean {
  const allowed = new Set([...PLAIN_OPTIONS, ...extra]);
  return Object.entries(options).every(([name, value]) => value === undefined || allowed.has(name));
}

export function privateDirectory(dir: string): boolean {
  const found = statSync(dir, { throwIfNoEntry: false });
  return (
    found !== undefined &&
    found.isDirectory() &&
    found.uid === process.getuid?.() &&
    (found.mode & OTHERS_ACCESS) === 0
  );
}

function heapFlags(): string[] {
  const own = hostEnvironment().javaOptions.split(/\s+/u);
  return own.some((flag) => SIZING.test(flag)) ? [] : toolHeapFlags();
}

function supportsHost(java: string): boolean {
  const probed = probeJava(java, ['-version'], spawnSync);
  const feature = VERSION.exec(`${probed.stderr}${probed.stdout}`)?.[1];
  return feature !== undefined && Number(feature) >= HOST_RELEASE;
}

function nothing() {
  const value: unknown = JSON.parse('null');
  if (value !== null) {
    throw new TypeError('JSON null is not null');
  }
  return value;
}

function reply(fields: Partial<SpawnSyncReturns<string>>): SpawnSyncReturns<string> {
  const stdout = fields.stdout ?? '';
  const stderr = fields.stderr ?? '';
  const absent = nothing();
  return {
    pid: 0,
    output: [absent, stdout, stderr],
    stdout,
    stderr,
    status: absent,
    signal: absent,
    ...fields,
  };
}

function timedOut(command: string, stdout = '', stderr = ''): SpawnSyncReturns<string> {
  const error = Object.assign(new Error(`spawnSync ${command} ETIMEDOUT`), { code: 'ETIMEDOUT' });
  return reply({ signal: 'SIGTERM', error, stdout, stderr });
}

function outcomeReply(outcome: unknown, command: string): SpawnSyncReturns<string> | undefined {
  const kind = fieldOf(outcome, 'kind');
  if (kind === 'result') {
    return reply({
      status: numberOr(fieldOf(outcome, 'status'), 1),
      stdout: textOf(fieldOf(outcome, 'stdout')),
      stderr: textOf(fieldOf(outcome, 'stderr')),
    });
  }
  if (kind === 'timeout') {
    return timedOut(command);
  }
  return kind === 'crashed'
    ? reply({ signal: 'SIGKILL', stderr: 'the shared tool JVM stopped while it ran the tool' })
    : undefined;
}

type Exchange = { readonly dir: string; readonly key: string; readonly input: string };

function exchange(
  { dir, key, input }: Exchange,
  timeoutMs: number,
  command: string,
): SpawnSyncReturns<string> | undefined {
  const result = spawnSync(process.execPath, [CONNECT_SCRIPT], {
    input,
    encoding: 'utf8',
    maxBuffer: MAX_REPLY_BYTES,
    timeout: timeoutMs + CONNECT_GRACE_MS,
  });
  if (result.error !== undefined) {
    stopHost(dir, key);
    return fieldOf(result.error, 'code') === 'ETIMEDOUT' ? timedOut(command) : undefined;
  }
  const parsed = attempt((): unknown => JSON.parse(result.stdout));
  return result.status === 0 && parsed.ok ? outcomeReply(parsed.value, command) : undefined;
}

export type Dispatch = {
  readonly java: string;
  readonly jvmArgs: readonly string[];
  readonly identity: readonly unknown[];
  readonly cwd: string;
  readonly request: readonly string[];
  readonly checked: readonly string[] | undefined;
  readonly timeout: number | undefined;
  readonly label: string;
};

function hostKey(job: Dispatch): string {
  return createHash('sha256')
    .update(
      JSON.stringify([job.java, job.jvmArgs, job.identity, hostEnvironment().javaOptionVariables]),
    )
    .digest('hex')
    .slice(0, KEY_LENGTH);
}

function hostable(job: Dispatch): boolean {
  if (!(path.isAbsolute(job.cwd) && supportsHost(job.java))) {
    return false;
  }
  if (job.checked !== undefined && hasRelativePath(job.checked, job.cwd)) {
    traceHosting('relative', job.label);
    return false;
  }
  return true;
}

export function dispatchToHost(job: Dispatch): SpawnSyncReturns<string> | undefined {
  const dir = hostsDirectory();
  const config = dir === undefined ? undefined : readHostConfig(dir);
  const key = hostKey(job);
  if (
    dir === undefined ||
    config === undefined ||
    !privateDirectory(dir) ||
    !hostable(job) ||
    !socketFits(dir, key)
  ) {
    return undefined;
  }
  const timeoutMs =
    typeof job.timeout === 'number' && job.timeout > 0 ? job.timeout : DEFAULT_TIMEOUT_MS;
  const launch = {
    java: job.java,
    jvmArgs: [...heapFlags(), ...job.jvmArgs],
    classpath: config.classpath,
    owner: config.owner,
    maxHosts: config.maxHosts,
  };
  const input = JSON.stringify({ dir, key, launch, request: job.request, timeoutMs });
  const reply = exchange({ dir, key, input }, timeoutMs, job.java);
  traceHosting(reply === undefined ? 'fallback' : 'hosted', job.label);
  return reply;
}

export function hostedRun(
  run: HostedRun,
  timeout?: number,
  allowed: Readonly<Record<string, HostedTool>> = HOSTED_TOOLS,
): SpawnSyncReturns<string> | undefined {
  const tool = hostedTool(run.mainClass, allowed);
  if (tool === undefined || run.java === undefined || run.mainClass === undefined) {
    return undefined;
  }
  const fresh = tool.loader === 'fresh';
  return dispatchToHost({
    java: run.java,
    jvmArgs: run.jvmArgs ?? [],
    identity: [run.classpath ?? [], fresh],
    cwd: run.cwd,
    request: [
      'run',
      fresh ? 'fresh' : 'warm',
      run.mainClass,
      run.cwd,
      (run.classpath ?? []).join(CLASSPATH_SEPARATOR),
      ...run.args,
    ],
    checked: tool.paths === 'resolved' ? undefined : run.args,
    timeout,
    label: run.mainClass,
  });
}

export function hostedSpawnFor(
  run: HostedRun,
  plain: JavaSpawn = spawnSyncWithOutputFile,
): JavaSpawn | undefined {
  if (hostsDirectory() === undefined || hostedTool(run.mainClass) === undefined) {
    return undefined;
  }
  return (command, args, options) =>
    (onlyPlainOptions(options)
      ? hostedRun({ ...run, java: command }, options.timeout)
      : undefined) ?? plain(command, args, options);
}
