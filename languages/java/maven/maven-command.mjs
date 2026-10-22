import { spawnSyncWithOutputFile } from '../../../core/tooling/output-file.mjs';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { wrapperTarget } from '../adapters/gradle-wrapper/gradle-command.mjs';

const MAVEN_TIMEOUT_MS = 15 * 60 * 1000;
const TOOL_TIMEOUT_MS = 15 * 60 * 1000;
const MAX_OUTPUT_BYTES = 50 * 1024 * 1024;
const MAX_ERROR_LINES = 40;
const MILLISECONDS_PER_MINUTE = 60_000;
const MINIMUM_MAVEN = '3.6.3';
const OLD_MAVEN = /Unrecognized option: --no-transfer-progress|requires Maven version/u;
const MAVEN_FLAGS = ['--batch-mode', '--no-transfer-progress', '-Dstyle.color=never'];
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
const JVM_NOISE =
  /^(?:Picked up (?:JAVA_TOOL_OPTIONS|_JAVA_OPTIONS|JDK_JAVA_OPTIONS)|NOTE: Picked up)/u;

export function mavenTarget({ projectRoot, configured, args, platform }) {
  return wrapperTarget({
    projectRoot,
    configured,
    args,
    platform,
    wrapper: 'mvnw',
    windowsWrapper: 'mvnw.cmd',
    tool: 'mvn',
  });
}

export function mavenErrorSummary(output) {
  const lines = output.split(/\r?\n/u).filter((line) => !JVM_NOISE.test(line));
  const errors = lines.filter(
    (line) => line.startsWith('[ERROR]') && !MAVEN_NOISE.some((noise) => noise.test(line)),
  );
  const chosen = errors.length > 0 ? errors : lines.filter((line) => line.trim() !== '');
  const hint = OLD_MAVEN.test(output) ? [`nitpicker needs Maven ${MINIMUM_MAVEN} or newer`] : [];
  return [...chosen.slice(0, MAX_ERROR_LINES), ...hint].join('\n') || 'no diagnostic output';
}

function missingMaven(error, command) {
  return error.code === 'ENOENT'
    ? new Error(
        `${command} was not found. Add the Maven wrapper (mvnw) to the project, put mvn on the PATH, or set NITPICKER_MAVEN`,
      )
    : error;
}

function duration(milliseconds) {
  return milliseconds % MILLISECONDS_PER_MINUTE === 0
    ? `${String(milliseconds / MILLISECONDS_PER_MINUTE)} minutes`
    : `${String(milliseconds / 1000)} s`;
}

function spawnFailure(error, { command, projectRoot, timeoutMs }) {
  if (error.code !== 'ETIMEDOUT') {
    return missingMaven(error, command);
  }
  return new Error(
    `Maven did not finish in ${projectRoot} within ${duration(timeoutMs)} and was stopped. ` +
      'Its post-integration-test steps may not have run, so containers or servers the build ' +
      'started may still be running',
  );
}

export function runMaven({
  projectRoot,
  maven,
  args,
  timeoutMs = MAVEN_TIMEOUT_MS,
  spawn = spawnSyncWithOutputFile,
}) {
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
    throw new Error(
      `Maven failed in ${projectRoot}:\n${mavenErrorSummary(`${result.stdout}\n${result.stderr}`)}`,
    );
  }
  return result.stdout;
}

export function javaCommand(name) {
  const home = process.env.JAVA_HOME;
  const candidate = home ? path.join(home, 'bin', name) : undefined;
  return candidate !== undefined && (existsSync(candidate) || existsSync(`${candidate}.exe`))
    ? candidate
    : name;
}

function argumentFileToken(value) {
  return `"${String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
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
  spawn = spawnSyncWithOutputFile,
}) {
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
      timeout: TOOL_TIMEOUT_MS,
    });
    if (result.error?.code === 'ENOENT') {
      throw new Error(
        `java not found (${java}): set JAVA_HOME to a JDK, or put its bin directory on the PATH`,
      );
    }
    if (result.error !== undefined) {
      throw result.error;
    }
    if (!accept(result)) {
      const detail = `${result.stderr}\n${result.stdout}`
        .split(/\r?\n/u)
        .filter((line) => line.trim() !== '' && !JVM_NOISE.test(line))
        .slice(0, MAX_ERROR_LINES)
        .join('\n');
      throw new Error(`${tool} failed with exit code ${String(result.status)}: ${detail}`);
    }
    return result;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
