import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { SUPERVISOR } from '../gradle-wrapper/gradle-process.mjs';
import { runFakeGradle } from './fake-gradle/run-fake-gradle.mjs';

export { EMPTY_MUTATION_FACTS } from './fake-gradle/kotlin-empty-reports.mjs';

export const fakeGradle = path.resolve(import.meta.dirname, '../fixtures/fake-gradle.mjs');

function answerOf(invocation) {
  const { maxBuffer } = invocation.options;
  let run;
  try {
    run = runFakeGradle({ args: invocation.args, cwd: invocation.options.cwd });
  } catch (error) {
    run = { status: 1, stdout: '', stderr: `${error.message}\n` };
  }
  const bytes = Buffer.byteLength(run.stdout) + Buffer.byteLength(run.stderr);
  if (bytes > maxBuffer) {
    return {
      status: undefined,
      stdout: '',
      stderr: '',
      error: { message: 'Gradle output exceeded maxBuffer (ENOBUFS)', code: 'ENOBUFS' },
    };
  }
  return { ...run, signal: undefined, error: undefined };
}

export function spawnFakeGradle(command, args, options) {
  if (command !== process.execPath || args[0] !== SUPERVISOR) {
    return spawnSync(command, args, options);
  }
  const invocation = JSON.parse(options.input);
  if (invocation.command !== fakeGradle) {
    return spawnSync(command, args, options);
  }
  return {
    status: 0,
    signal: undefined,
    stdout: JSON.stringify(answerOf(invocation)),
    stderr: '',
    error: undefined,
  };
}

export const fakeGradleRun = { gradle: fakeGradle, spawn: spawnFakeGradle };
