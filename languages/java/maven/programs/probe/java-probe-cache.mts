import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { hostEnvironment } from '../../../builds/host/config/host-environment.config.mts';
import { cacheDirectory } from '../../maven-tools.mjs';
import type { JavaSpawn } from '../../../adapters/typed/java-values.mts';
import { attempt, valueOr } from '../../../../../shared/values/attempt/attempt.mts';

const PROBE_CACHE = 'java-probes';
const KEY_LENGTH = 32;

type Output = { readonly stdout: string; readonly stderr: string };

function candidates(java: string): string[] {
  return path.isAbsolute(java) || java.includes(path.sep)
    ? [java]
    : hostEnvironment()
        .searchPath.split(path.delimiter)
        .filter((directory) => directory !== '')
        .map((directory) => path.join(directory, java));
}

export function locateBinary(java: string): string | undefined {
  for (const candidate of candidates(java)) {
    const resolved = attempt(() => realpathSync(path.resolve(candidate)));
    if (resolved.ok) {
      return resolved.value;
    }
  }
  return undefined;
}

function probeFile(java: string, args: readonly string[]): string | undefined {
  const binary = locateBinary(java);
  if (binary === undefined) {
    return undefined;
  }
  const { mtimeMs, size } = statSync(binary);
  const key = createHash('sha256')
    .update(JSON.stringify([binary, mtimeMs, size, args]))
    .digest('hex')
    .slice(0, KEY_LENGTH);
  return path.join(cacheDirectory(PROBE_CACHE), `${key}.json`);
}

function readProbe(file: string): Output | undefined {
  const value: unknown = valueOr((): unknown => JSON.parse(readFileSync(file, 'utf8')), undefined);
  if (typeof value === 'object' && value !== null && 'stdout' in value && 'stderr' in value) {
    const { stdout, stderr } = value;
    return typeof stdout === 'string' && typeof stderr === 'string'
      ? { stdout, stderr }
      : undefined;
  }
  return undefined;
}

function writeProbe(file: string, output: Output): void {
  attempt(() => {
    mkdirSync(path.dirname(file), { recursive: true });
    const staging = `${file}.${String(process.pid)}`;
    writeFileSync(staging, JSON.stringify(output));
    renameSync(staging, file);
  });
}

export function probeJava(
  java: string,
  args: readonly string[],
  spawn: JavaSpawn | typeof spawnSync,
): Pick<SpawnSyncReturns<string>, 'status' | 'stdout' | 'stderr'> & { readonly error?: Error } {
  const file = spawn === spawnSync ? probeFile(java, args) : undefined;
  const cached = file === undefined ? undefined : readProbe(file);
  if (cached !== undefined) {
    return { status: 0, ...cached };
  }
  const result = spawn(java, [...args], { encoding: 'utf8' });
  if (file !== undefined && result.error === undefined && result.status === 0) {
    writeProbe(file, { stdout: result.stdout, stderr: result.stderr });
  }
  return result;
}
