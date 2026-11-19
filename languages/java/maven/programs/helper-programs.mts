import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import type { JavaEnvironment, JavaSpawn } from '../../adapters/typed/java-values.mts';
import { javaCommand, runJava } from './java-command.mts';
import { cacheDirectory, publishDirectory } from '../maven-tools.mts';

const PROPERTY_SEPARATOR = ' = ';

type Jdk = { readonly vendor: string; readonly version: string };
type Program = {
  readonly tool: string;
  readonly name: string;
  readonly sources: readonly string[];
  readonly version: string;
  readonly libraries: readonly string[];
  readonly cwd: string;
  readonly root?: string | undefined;
  readonly release?: number | undefined;
  readonly spawn?: JavaSpawn | undefined;
  readonly timeoutMs?: number | undefined;
  readonly java?: string | undefined;
  readonly environment?: JavaEnvironment | undefined;
};
type CacheInput = Pick<Program, 'sources' | 'version' | 'root' | 'release'> & { readonly jdk: Jdk };

function jdkIdentity(tool: string, spawn: JavaSpawn, java: string): Jdk {
  const result = spawn(java, ['-XshowSettings:properties', '-version'], {
    encoding: 'utf8',
  });
  if (result.error !== undefined || result.status !== 0) {
    throw new Error(
      `${tool} need the JDK identity, but java -version failed: ${result.error?.message ?? result.stderr}`,
    );
  }
  const lines = `${result.stderr}\n${result.stdout}`.split(/\r?\n/u).map((line) => line.trim());
  function property(name: string): string {
    const line = lines.find((candidate) => candidate.startsWith(`${name}${PROPERTY_SEPARATOR}`));
    if (line === undefined) {
      throw new Error(`${tool} need the JDK identity, but java reported no ${name}`);
    }
    return line.slice(name.length + PROPERTY_SEPARATOR.length);
  }
  return { vendor: property('java.vendor'), version: property('java.version') };
}

function majorOf(version: string): number {
  const [first = Number.NaN, second = Number.NaN] = version
    .split(/[.+_-]/u)
    .map((part) => Number.parseInt(part, 10));
  return first === 1 ? second : first;
}

function requireRelease(tool: string, jdk: Jdk, release: number | undefined): void {
  if (release !== undefined && !(majorOf(jdk.version) >= release)) {
    throw new Error(
      `${tool} needs JDK ${String(release)} or newer, but java reports ${jdk.version}; point JAVA_HOME at JDK ${String(release)} or newer`,
    );
  }
}

export function programSources(
  directory: string,
  { recursive }: { readonly recursive: boolean },
): string[] {
  return readdirSync(directory, { recursive, encoding: 'utf8' })
    .map((entry) => entry.replaceAll('\\', '/'))
    .filter((name) => name.endsWith('.java'))
    .toSorted((left, right) => left.localeCompare(right))
    .map((name) => path.join(directory, name));
}

function cacheKey({ sources, version, root, jdk, release }: CacheInput): string {
  const digest = createHash('sha256');
  for (const source of sources) {
    if (root !== undefined) {
      digest.update(`${path.relative(root, source).replaceAll('\\', '/')}\0`);
    }
    digest.update(readFileSync(source));
  }
  digest.update(`${version}|${jdk.vendor}|${jdk.version}|${String(release ?? '')}`);
  return digest.digest('hex');
}

export function compiledProgram({
  tool,
  name,
  sources,
  version,
  root,
  release,
  libraries,
  cwd,
  spawn = spawnSync,
  timeoutMs,
  java = javaCommand('java'),
  environment = {},
}: Program): string {
  const jdk = jdkIdentity(tool, spawn, java);
  requireRelease(tool, jdk, release);
  const cache = cacheDirectory(name, environment);
  mkdirSync(cache, { recursive: true });
  const classes = path.join(cache, cacheKey({ sources, version, root, jdk, release }));
  if (existsSync(classes)) {
    return classes;
  }
  const staging = `${classes}.${randomUUID()}`;
  mkdirSync(staging, { recursive: true });
  try {
    runJava({
      tool,
      java: path.join(path.dirname(java), path.basename(java).replace('java', 'javac')),
      jvmArgs: [
        '-proc:none',
        '-nowarn',
        ...(release === undefined ? [] : ['--release', String(release)]),
        '-d',
        staging,
      ],
      classpath: libraries,
      args: sources,
      cwd,
      spawn,
      timeoutMs,
      accept: (result) => result.status === 0,
    });
  } catch (error) {
    rmSync(staging, { recursive: true, force: true });
    throw error;
  }
  publishDirectory(staging, classes);
  return classes;
}
