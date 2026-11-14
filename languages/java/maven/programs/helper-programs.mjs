import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { javaCommand, runJava } from '../maven-command.mjs';
import { cacheDirectory, publishDirectory } from '../maven-tools.mjs';

const PROPERTY_SEPARATOR = ' = ';

function jdkIdentity(tool, spawn, java) {
  const result = spawn(java, ['-XshowSettings:properties', '-version'], {
    encoding: 'utf8',
  });
  if (result.error !== undefined || result.status !== 0) {
    throw new Error(
      `${tool} need the JDK identity, but java -version failed: ${result.error?.message ?? result.stderr}`,
    );
  }
  const lines = `${result.stderr}\n${result.stdout}`.split(/\r?\n/u).map((line) => line.trim());
  function property(name) {
    const line = lines.find((candidate) => candidate.startsWith(`${name}${PROPERTY_SEPARATOR}`));
    if (line === undefined) {
      throw new Error(`${tool} need the JDK identity, but java reported no ${name}`);
    }
    return line.slice(name.length + PROPERTY_SEPARATOR.length);
  }
  return { vendor: property('java.vendor'), version: property('java.version') };
}

function majorOf(version) {
  const [first, second] = version.split(/[.+_-]/u).map((part) => Number.parseInt(part, 10));
  return first === 1 ? second : first;
}

function requireRelease(tool, jdk, release) {
  if (release !== undefined && !(majorOf(jdk.version) >= release)) {
    throw new Error(
      `${tool} needs JDK ${String(release)} or newer, but java reports ${jdk.version}; point JAVA_HOME at JDK ${String(release)} or newer`,
    );
  }
}

export function programSources(directory, { recursive = false } = {}) {
  return readdirSync(directory, { recursive })
    .map((entry) => entry.replaceAll('\\', '/'))
    .filter((name) => name.endsWith('.java'))
    .toSorted((left, right) => left.localeCompare(right))
    .map((name) => path.join(directory, name));
}

function cacheKey({ sources, version, root, jdk, release }) {
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
}) {
  const jdk = jdkIdentity(tool, spawn, java);
  requireRelease(tool, jdk, release);
  const cache = cacheDirectory(name);
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
