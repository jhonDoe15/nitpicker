import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync } from 'node:fs';
import path from 'node:path';
import { javaCommand, runJava } from '../maven-command.mjs';
import { cacheDirectory } from '../maven-tools.mjs';

const PROPERTY_SEPARATOR = ' = ';

function jdkIdentity(tool) {
  const result = spawnSync(javaCommand('java'), ['-XshowSettings:properties', '-version'], {
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
  return `${property('java.vendor')}|${property('java.version')}`;
}

export function programSources(directory, { recursive = false } = {}) {
  return readdirSync(directory, { recursive })
    .map((entry) => entry.replaceAll('\\', '/'))
    .filter((name) => name.endsWith('.java'))
    .sort()
    .map((name) => path.join(directory, name));
}

function cacheKey({ tool, sources, version, root }) {
  const digest = createHash('sha256');
  for (const source of sources) {
    if (root !== undefined) {
      digest.update(`${path.relative(root, source).replaceAll('\\', '/')}\0`);
    }
    digest.update(readFileSync(source));
  }
  digest.update(`${version}|${jdkIdentity(tool)}`);
  return digest.digest('hex');
}

function publish(staging, classes) {
  try {
    renameSync(staging, classes);
  } catch (raced) {
    rmSync(staging, { recursive: true, force: true });
    if (!existsSync(classes)) {
      throw raced;
    }
  }
}

export function compiledProgram({ tool, name, sources, version, root, libraries, cwd }) {
  const cache = cacheDirectory(name);
  mkdirSync(cache, { recursive: true });
  const classes = path.join(cache, cacheKey({ tool, sources, version, root }));
  if (existsSync(classes)) {
    return classes;
  }
  const staging = `${classes}.${randomUUID()}`;
  mkdirSync(staging, { recursive: true });
  try {
    runJava({
      tool,
      java: javaCommand('javac'),
      jvmArgs: ['-proc:none', '-nowarn', '-d', staging],
      classpath: libraries,
      args: sources,
      cwd,
      accept: (result) => result.status === 0,
    });
  } catch (error) {
    rmSync(staging, { recursive: true, force: true });
    throw error;
  }
  publish(staging, classes);
  return classes;
}
