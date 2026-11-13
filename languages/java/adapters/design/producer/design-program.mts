import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { GRADLE_DIRECTORY } from '../../../builds/java-build.mjs';
import { javaCommand, runJava } from '../../../maven/maven-command.mjs';
import { cacheDirectory, publishDirectory } from '../../../maven/maven-tools.mjs';
import { resolveInside } from '../../../../../shared/conventions/read-inside.mjs';
import { fieldOf, textOf } from '../../../../../shared/values/readers.mts';
import { type JavaSpawn, callUntyped } from '../../typed/java-values.mts';

type CompileRequest = {
  readonly sources?: readonly string[];
  readonly cache?: string;
  readonly spawn?: JavaSpawn;
};
type ProgramRun = {
  readonly classes: string;
  readonly projectRoot: string;
  readonly fileList: string;
  readonly output: string;
  readonly java: string | undefined;
  readonly spawn?: JavaSpawn;
};

const SOURCE_DIRECTORY = path.join(GRADLE_DIRECTORY, 'design');
const TOOL = 'DesignFacts';
const MAIN_CLASS = 'nitpicker.designfacts.DesignFacts';
const KEY_LENGTH = 32;
const NOISE = /^(?:Picked up |NOTE: Picked up )/u;
const THREAD_STACK = '-Xss32m';

function versionText(command: string, spawn: JavaSpawn): string {
  const result = spawn(textOf(javaCommand(command)), ['-version'], { encoding: 'utf8' });
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

function inside(root: string, name: string): string {
  const full = resolveInside(root, name);
  if (full === undefined) {
    throw new Error(`${TOOL}: ${name} is outside ${root}`);
  }
  return full;
}

function designSources(directory: string = SOURCE_DIRECTORY): string[] {
  return readdirSync(directory, { recursive: true, encoding: 'utf8' })
    .map((name) => name.replaceAll('\\', '/'))
    .filter((name) => name.endsWith('.java'))
    .sort()
    .map((name) => inside(directory, name));
}

function cacheKey(sources: readonly string[], spawn: JavaSpawn): string {
  const digest = createHash('sha256');
  for (const source of sources) {
    digest.update(`${path.relative(SOURCE_DIRECTORY, source).replaceAll('\\', '/')}\n`);
    digest.update(readFileSync(source));
  }
  digest.update(`${versionText('javac', spawn)}|${versionText('java', spawn)}`);
  return digest.digest('hex').slice(0, KEY_LENGTH);
}

function succeeded(result: unknown): boolean {
  return fieldOf(result, 'status') === 0;
}

export function compileDesignProgram({
  sources = designSources(),
  cache,
  spawn = spawnSync,
}: CompileRequest = {}): string {
  const root = cache ?? textOf(cacheDirectory('design-facts'));
  mkdirSync(root, { recursive: true });
  const classes = inside(root, cacheKey(sources, spawn));
  if (existsSync(classes)) {
    return classes;
  }
  const staging = `${classes}.${randomUUID()}`;
  mkdirSync(staging, { recursive: true });
  try {
    callUntyped(runJava, {
      tool: TOOL,
      java: textOf(javaCommand('javac')),
      jvmArgs: ['--release', '21', '-proc:none', '-nowarn', '-d', staging],
      args: sources,
      cwd: SOURCE_DIRECTORY,
      accept: succeeded,
      spawn,
    });
  } catch (error) {
    rmSync(staging, { recursive: true, force: true });
    throw error;
  }
  publishDirectory(staging, classes);
  return classes;
}

export function runDesignProgram({
  classes,
  projectRoot,
  fileList,
  output,
  java,
  spawn = spawnSync,
}: ProgramRun): void {
  callUntyped(runJava, {
    ...(java === undefined ? {} : { java }),
    tool: TOOL,
    classpath: [classes],
    mainClass: MAIN_CLASS,
    jvmArgs: [THREAD_STACK],
    args: [output, projectRoot, fileList],
    cwd: projectRoot,
    accept: succeeded,
    spawn,
  });
}
