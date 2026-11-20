import { chmodSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fieldOf, textOf, textsOf } from '../../../../../shared/values/readers.mts';
import { machineMemory } from '../../../../../shared/processes/machine-capacity.mts';
import { privateDirectory } from '../client/host-client.mts';
import { traceHosting } from '../config/host-trace.mts';
import type { compiledProgram } from '../../../maven/programs/helper-programs.mts';
import { HOST_CONFIG_FILE, HOST_RELEASE, hostCap } from '../config/host-config.mts';
import { stopHost } from '../config/host-files.mts';
import { exportHostsDirectory, hostEnvironment } from '../config/host-environment.config.mts';
import { attempt } from '../../../../../shared/values/attempt/attempt.mts';

export type ToolHosts = { readonly stop: () => void };
type HostProgram = {
  readonly compile: typeof compiledProgram;
  readonly root: string;
  readonly sources: () => string[];
};
export type HostRequest = {
  readonly work: string;
  readonly modules: number;
  readonly tools: unknown;
  readonly pinned: unknown;
  readonly warn: { readonly write: (text: string) => unknown };
  readonly program: HostProgram;
  readonly java?: string | undefined;
};

const HOSTS_FOLDER = 'hosts';
const MINIMUM_MODULES = 2;
const PRIVATE_MODE = 0o700;

export function stopAllHosts(directory: string): void {
  for (const name of readdirSync(directory)) {
    if (name.endsWith('.ready')) {
      stopHost(directory, name.slice(0, -'.ready'.length));
    }
  }
}

export function compiledHost({
  work,
  tools,
  pinned,
  program,
  java,
}: Omit<HostRequest, 'modules' | 'warn'>): {
  classpath: string;
} {
  const libraries = textsOf(fieldOf(tools, 'effects')).filter((entry) => existsSync(entry));
  const classes = program.compile({
    tool: 'The shared tool JVM',
    name: 'tool-host',
    sources: program.sources(),
    version: textOf(fieldOf(pinned, 'asm')),
    root: program.root,
    release: HOST_RELEASE,
    libraries,
    cwd: work,
    ...(java === undefined ? {} : { java }),
  });
  return { classpath: [classes, ...libraries].join(path.delimiter) };
}

function privateDirectoryAt(directory: string): void {
  mkdirSync(directory, { recursive: true, mode: PRIVATE_MODE });
  chmodSync(directory, PRIVATE_MODE);
  if (!privateDirectory(directory)) {
    throw new Error(`${directory} is not a private directory owned by this user`);
  }
}

export function warnOff(reason: unknown, warn: HostRequest['warn']): void {
  const text = reason instanceof Error ? reason.message : String(reason);
  const firstLine = text.split('\n')[0] ?? '';
  traceHosting('off', firstLine);
  warn.write(
    `nitpicker: Java tools run in separate JVMs per module (tool hosting is off: ${firstLine})\n`,
  );
}

function launch(request: HostRequest, maxHosts: number): ToolHosts {
  const { classpath } = compiledHost(request);
  const directory = path.join(request.work, HOSTS_FOLDER);
  privateDirectoryAt(directory);
  writeFileSync(
    path.join(directory, HOST_CONFIG_FILE),
    JSON.stringify({ owner: process.pid, classpath, maxHosts }),
  );
  const restore = exportHostsDirectory(directory);
  return {
    stop() {
      stopAllHosts(directory);
      restore();
    },
  };
}

export function affordableHosts(warn: HostRequest['warn']): number | undefined {
  if (process.platform === 'win32' || hostEnvironment().hostingOff) {
    return undefined;
  }
  const maxHosts = hostCap(machineMemory());
  if (maxHosts === undefined) {
    warnOff('this machine has too little memory to keep the tool JVMs idle', warn);
  }
  return maxHosts;
}

export function startToolHosts(request: HostRequest): ToolHosts | undefined {
  const maxHosts = request.modules < MINIMUM_MODULES ? undefined : affordableHosts(request.warn);
  if (maxHosts === undefined) {
    return undefined;
  }
  const started = attempt(() => launch(request, maxHosts));
  if (started.ok) {
    return started.value;
  }
  warnOff(started.error, request.warn);
  return undefined;
}
