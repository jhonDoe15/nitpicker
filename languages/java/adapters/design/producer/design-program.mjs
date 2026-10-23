import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { GRADLE_DIRECTORY } from '../../../builds/java-build.mjs';
import { javaCommand, runJava } from '../../../maven/maven-command.mjs';
import { cacheDirectory, publishDirectory } from '../../../maven/maven-tools.mjs';
import { resolveInside } from '../../../../../shared/conventions/read-inside.mjs';

const SOURCE_DIRECTORY = path.join(GRADLE_DIRECTORY, 'design');
const TOOL = 'DesignFacts';
const MAIN_CLASS = 'nitpicker.designfacts.DesignFacts';
const KEY_LENGTH = 32;
const NOISE = /^(?:Picked up |NOTE: Picked up )/u;

function versionText(command) {
  const result = spawnSync(javaCommand(command), ['-version'], { encoding: 'utf8' });
  if (result.error !== undefined) {
    throw new Error(
      `${TOOL} needs a JDK, but ${command} could not run: ${result.error.message}. Set JAVA_HOME to a JDK`,
    );
  }
  return `${result.stderr}${result.stdout}`
    .split(/\r?\n/u)
    .filter((line) => !NOISE.test(line))
    .join('\n');
}

function designSources(directory = SOURCE_DIRECTORY) {
  return readdirSync(directory, { recursive: true })
    .map((name) => String(name).replaceAll('\\', '/'))
    .filter((name) => name.endsWith('.java'))
    .sort()
    .map((name) => inside(directory, name));
}

function inside(root, name) {
  const full = resolveInside(root, name);
  if (full === undefined) {
    throw new Error(`${TOOL}: ${name} is outside ${root}`);
  }
  return full;
}

function cacheKey(sources) {
  const digest = createHash('sha256');
  for (const source of sources) {
    digest.update(`${path.relative(SOURCE_DIRECTORY, source).replaceAll('\\', '/')}\n`);
    digest.update(readFileSync(source));
  }
  digest.update(`${versionText('javac')}|${versionText('java')}`);
  return digest.digest('hex').slice(0, KEY_LENGTH);
}

export function compileDesignProgram({ sources = designSources(), cache } = {}) {
  const root = cache ?? cacheDirectory('design-facts');
  mkdirSync(root, { recursive: true });
  const classes = inside(root, cacheKey(sources));
  if (existsSync(classes)) {
    return classes;
  }
  const staging = `${classes}.${randomUUID()}`;
  mkdirSync(staging, { recursive: true });
  try {
    runJava({
      tool: TOOL,
      java: javaCommand('javac'),
      jvmArgs: ['-proc:none', '-nowarn', '-d', staging],
      args: sources,
      cwd: SOURCE_DIRECTORY,
      accept: (result) => result.status === 0,
    });
  } catch (error) {
    rmSync(staging, { recursive: true, force: true });
    throw error;
  }
  publishDirectory(staging, classes);
  return classes;
}

export function runDesignProgram({ classes, projectRoot, fileList, output }) {
  runJava({
    tool: TOOL,
    classpath: [classes],
    mainClass: MAIN_CLASS,
    args: [output, projectRoot, fileList],
    cwd: projectRoot,
    accept: (result) => result.status === 0,
  });
}
