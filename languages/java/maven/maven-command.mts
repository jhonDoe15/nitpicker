import type { SpawnSyncReturns } from 'node:child_process';
import { spawnSyncWithOutputFile } from '../../../core/tooling/output-file/output-file.mjs';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { JVM_NOISE } from '../../../shared/messages/jvm/jvm-noise.mjs';
import { wrapperTarget } from '../adapters/gradle-wrapper/gradle-command.mts';
import { argumentFileToken } from '../builds/lint/javac-options.mts';
import { withCompileErrors } from '../builds/compile-errors/compile-findings.mts';
import { explainedError } from '../../../shared/messages/troubleshooting.mjs';
import { mavenBudget } from '../adapters/gradle-wrapper/gradle-budget.mts';
import { describeProcessEnd } from '../../../shared/processes/process-failure.mjs';
import { fieldOf, numberOr, textOf } from '../../../shared/values/readers.mts';
import type { JavaSpawn } from '../adapters/typed/java-values.mts';

type SpawnTarget = { readonly command: string; readonly args: string[]; readonly shell: boolean };
type TargetRequest = {
  readonly projectRoot: string;
  readonly configured: string | undefined;
  readonly args: readonly string[];
  readonly platform?: NodeJS.Platform | undefined;
  readonly wrapper: string;
  readonly windowsWrapper: string;
  readonly tool: string;
};
type MavenRunRequest = {
  readonly projectRoot: string;
  readonly maven?: string | undefined;
  readonly args: readonly string[];
  readonly timeoutMs?: number | undefined;
  readonly spawn?: JavaSpawn | undefined;
};
type JavaRunRequest = {
  readonly java?: string | undefined;
  readonly tool: string;
  readonly classpath?: readonly string[] | undefined;
  readonly mainClass?: string | undefined;
  readonly jvmArgs?: readonly string[];
  readonly args: readonly string[];
  readonly cwd: string;
  readonly accept?: (result: SpawnSyncReturns<string>) => boolean;
  readonly spawn?: JavaSpawn | undefined;
  readonly timeoutMs?: number | undefined;
};

const targetOf: (request: TargetRequest) => SpawnTarget = wrapperTarget;
const spawnWithOutputFile: JavaSpawn = spawnSyncWithOutputFile;
const describeEnd: (
  name: string,
  result: SpawnSyncReturns<string>,
  options?: { where?: string; detail?: string },
) => string = describeProcessEnd;
const noiseLine: RegExp = JVM_NOISE;
const explained: (message: string) => Error = explainedError;
function commandTimeoutMs(): number {
  return numberOr(fieldOf(mavenBudget(), 'commandTimeoutMs'), 0);
}

const MAX_OUTPUT_BYTES = 50 * 1024 * 1024;
const MAX_ERROR_LINES = 40;
const MILLISECONDS_PER_MINUTE = 60_000;
const MINIMUM_MAVEN = '3.6.3';
const OLD_MAVEN = /Unrecognized option: --no-transfer-progress|requires Maven version/u;
const MAVEN_FLAGS = ['--batch-mode', '--no-transfer-progress', '-Dstyle.color=never'];
const RERUN_SETTINGS = ['surefire', 'failsafe'];

export function testRerunArguments(values: Readonly<Record<string, unknown>> = {}): string[] {
  return RERUN_SETTINGS.map(
    (plugin) =>
      `-D${plugin}.rerunFailingTestsCount=${textOf(values[`${plugin}.rerunFailingTestsCount`] ?? 0)}`,
  );
}

export const TEST_RERUNS_OFF = testRerunArguments();
const MAVEN_NOISE = [
  /^\[ERROR\]\s*$/u,
  /^\[ERROR\] -> \[Help \d+\]/u,
  /^\[ERROR\] \[Help \d+\]/u,
  /^\[ERROR\] To see the full stack trace/u,
  /^\[ERROR\] Re-run Maven using/u,
  /^\[ERROR\] For more information about the errors/u,
  /^\[ERROR\] After correcting the problems/u,
  /^\[ERROR\]\s+mvn <args> -rf/u,
];

export function mavenTarget({
  projectRoot,
  configured,
  args,
  platform,
}: {
  readonly projectRoot: string;
  readonly configured?: string | undefined;
  readonly args: readonly string[];
  readonly platform?: NodeJS.Platform | undefined;
}): SpawnTarget {
  return targetOf({
    projectRoot,
    configured,
    args,
    platform,
    wrapper: 'mvnw',
    windowsWrapper: 'mvnw.cmd',
    tool: 'mvn',
  });
}

export function mavenErrorSummary(output: string): string {
  const lines = output.split(/\r?\n/u).filter((line) => !noiseLine.test(line));
  const errors = lines.filter(
    (line) => line.startsWith('[ERROR]') && !MAVEN_NOISE.some((noise) => noise.test(line)),
  );
  const chosen = errors.length > 0 ? errors : lines.filter((line) => line.trim() !== '');
  const hint = OLD_MAVEN.test(output) ? [`nitpicker needs Maven ${MINIMUM_MAVEN} or newer`] : [];
  const summary = [...chosen.slice(0, MAX_ERROR_LINES), ...hint].join('\n');
  return summary === '' ? 'no diagnostic output' : summary;
}

function missingMaven(error: Error, command: string): Error {
  return fieldOf(error, 'code') === 'ENOENT'
    ? explained(
        `${command} was not found. Add the Maven wrapper (mvnw) to the project, put mvn on the PATH, or set NITPICKER_MAVEN`,
      )
    : error;
}

function duration(milliseconds: number): string {
  return milliseconds % MILLISECONDS_PER_MINUTE === 0
    ? `${String(milliseconds / MILLISECONDS_PER_MINUTE)} minutes`
    : `${String(milliseconds / 1000)} s`;
}

function spawnFailure(
  error: Error,
  { command, projectRoot, timeoutMs }: { command: string; projectRoot: string; timeoutMs: number },
): Error {
  if (fieldOf(error, 'code') !== 'ETIMEDOUT') {
    return missingMaven(error, command);
  }
  const stopped = explained(
    `Maven did not finish in ${projectRoot} within ${duration(timeoutMs)} and was stopped. ` +
      'Its post-integration-test steps may not have run, so containers or servers the build ' +
      'started may still be running. Set NITPICKER_MAVEN_TIMEOUT_MINUTES to give each Maven ' +
      'command more time',
  );
  return Object.defineProperty(stopped, 'timedOut', {
    value: { build: 'Maven', minutes: timeoutMs / MILLISECONDS_PER_MINUTE },
  });
}

export function runMaven({
  projectRoot,
  maven,
  args,
  timeoutMs = commandTimeoutMs(),
  spawn = spawnWithOutputFile,
}: MavenRunRequest): string {
  const target = mavenTarget({ projectRoot, configured: maven, args: [...MAVEN_FLAGS, ...args] });
  const result = spawn(target.command, target.args, {
    cwd: projectRoot,
    encoding: 'utf8',
    maxBuffer: MAX_OUTPUT_BYTES,
    shell: target.shell,
    timeout: timeoutMs,
  });
  if (result.error !== undefined) {
    throw spawnFailure(result.error, { command: target.command, projectRoot, timeoutMs });
  }
  if (result.status !== 0) {
    const output = `${result.stdout}\n${result.stderr}`;
    throw withCompileErrors(
      new Error(mavenFailureMessage(result, projectRoot, output)),
      output,
      projectRoot,
    );
  }
  return result.stdout;
}

function mavenFailureMessage(
  result: SpawnSyncReturns<string>,
  projectRoot: string,
  output: string,
): string {
  return typeof result.signal === 'string'
    ? describeEnd('Maven', result, {
        where: projectRoot,
        detail: output.trim() === '' ? '' : mavenErrorSummary(output),
      })
    : `Maven failed in ${projectRoot}:\n${mavenErrorSummary(output)}`;
}

function javaFailureMessage(
  tool: string,
  result: SpawnSyncReturns<string>,
  detail: string,
): string {
  return typeof result.signal === 'string'
    ? describeEnd(tool, result, { detail })
    : `${tool} failed with exit code ${String(result.status)}: ${detail === '' ? 'no diagnostic output' : detail}`;
}

export function javaCommand(name: string): string {
  const home = process.env['JAVA_HOME'];
  const candidate = home === undefined || home === '' ? undefined : path.join(home, 'bin', name);
  return candidate !== undefined && (existsSync(candidate) || existsSync(`${candidate}.exe`))
    ? candidate
    : name;
}

function javaSpawnFailure(
  error: Error,
  { java, tool, cwd, timeoutMs }: { java: string; tool: string; cwd: string; timeoutMs: number },
): Error {
  if (fieldOf(error, 'code') === 'ENOENT') {
    return explained(
      `java not found (${java}): set JAVA_HOME to a JDK, or put its bin directory on the PATH`,
    );
  }
  if (fieldOf(error, 'code') === 'ETIMEDOUT') {
    return explained(
      `${tool} did not finish in ${cwd} within ${duration(timeoutMs)} and was stopped. ` +
        'Set NITPICKER_MAVEN_TIMEOUT_MINUTES to give each Maven command and Java tool more time',
    );
  }
  return error;
}

export function runJava({
  java = javaCommand('java'),
  tool,
  classpath,
  mainClass,
  jvmArgs = [],
  args,
  cwd,
  accept = () => true,
  spawn = spawnWithOutputFile,
  timeoutMs = commandTimeoutMs(),
}: JavaRunRequest): SpawnSyncReturns<string> {
  const directory = mkdtempSync(path.join(tmpdir(), 'nitpicker-java-'));
  try {
    const argumentFile = path.join(directory, 'arguments');
    const tokens = [
      ...jvmArgs,
      ...(classpath === undefined ? [] : ['-cp', classpath.join(path.delimiter)]),
      ...(mainClass === undefined ? [] : [mainClass]),
      ...args,
    ];
    writeFileSync(argumentFile, tokens.map(argumentFileToken).join('\n'));
    const result = spawn(java, [`@${argumentFile}`], {
      cwd,
      encoding: 'utf8',
      maxBuffer: MAX_OUTPUT_BYTES,
      timeout: timeoutMs,
    });
    if (result.error !== undefined) {
      throw javaSpawnFailure(result.error, { java, tool, cwd, timeoutMs });
    }
    if (!accept(result)) {
      const detail = `${result.stderr}\n${result.stdout}`
        .split(/\r?\n/u)
        .filter((line) => line.trim() !== '' && !noiseLine.test(line))
        .slice(0, MAX_ERROR_LINES)
        .join('\n');
      const failure = new Error(javaFailureMessage(tool, result, detail));
      throw Object.defineProperty(failure, 'output', {
        value: `${result.stderr}\n${result.stdout}`,
      });
    }
    return result;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
