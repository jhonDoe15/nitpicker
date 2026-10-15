import { spawnSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { condenseFailure } from '../../adapters/gradle-wrapper/failure-text.mjs';

const MAX_OUTPUT_BYTES = 100 * 1024 * 1024;
const MAX_FAILURE_LENGTH = 3000;

function launchArguments({ classpath, mainClass, jar, source, command }) {
  if (command !== undefined) {
    return [];
  }
  if (jar !== undefined) {
    return ['-jar', jar];
  }
  if (source !== undefined) {
    return [source];
  }
  return ['-cp', classpath.join(path.delimiter), mainClass];
}

export function javaCommand(javaHome, name = 'java') {
  return path.join(javaHome, 'bin', name);
}

export function runJavaTool(
  context,
  { label, jvmArgs = [], args = [], okExit, stdoutFile, ...launch },
) {
  const result = spawnSync(
    launch.command ?? javaCommand(context.javaHome),
    [...jvmArgs, ...launchArguments(launch), ...args],
    {
      cwd: context.projectRoot,
      encoding: 'utf8',
      maxBuffer: MAX_OUTPUT_BYTES,
      timeout: context.deadline.remaining(),
    },
  );
  if (result.error !== undefined) {
    throw result.error;
  }
  if (okExit !== undefined && !okExit.includes(result.status)) {
    const detail = condenseFailure(`${result.stderr}\n${result.stdout}`, MAX_FAILURE_LENGTH);
    throw new Error(`${label} failed with exit code ${String(result.status)}: ${detail}`);
  }
  if (stdoutFile !== undefined) {
    writeFileSync(stdoutFile, result.stdout);
  }
  return result;
}

export function requireReport(file, label) {
  if (!existsSync(file)) {
    throw new Error(`${label} wrote no report to ${file}`);
  }
}
