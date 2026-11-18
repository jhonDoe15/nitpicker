import {
  spawnSync,
  type SpawnSyncOptionsWithStringEncoding,
  type SpawnSyncReturns,
} from 'node:child_process';
import path from 'node:path';
import { SUPERVISOR } from '../gradle-wrapper/gradle-process.mts';
import {
  fieldOf,
  messageOf,
  numberOr,
  parseJson,
  textOf,
  textsOf,
} from '../../../../shared/values/readers.mts';
import { runFakeGradle } from './fake-gradle/run-fake-gradle.mts';

export { EMPTY_MUTATION_FACTS } from './fake-gradle/kotlin-empty-reports.mts';

export const fakeGradle = path.resolve(import.meta.dirname, '../fixtures/fake-gradle.mjs');

type Invocation = { command: string; args: string[]; options: { maxBuffer: number; cwd: string } };
type FakeRun = { status: number; stdout: string; stderr: string };

function noSignal(): SpawnSyncReturns<string>['signal'] {
  const none = parseJson('null');
  if (none !== null) {
    throw new TypeError('Expected null');
  }
  return none;
}

function invocationOf(value: unknown): Invocation {
  const options = fieldOf(value, 'options');
  return {
    command: textOf(fieldOf(value, 'command')),
    args: textsOf(fieldOf(value, 'args')),
    options: {
      maxBuffer: numberOr(fieldOf(options, 'maxBuffer'), 0),
      cwd: textOf(fieldOf(options, 'cwd')),
    },
  };
}

function answerOf(invocation: Invocation) {
  const { maxBuffer } = invocation.options;
  let run: FakeRun;
  try {
    run = runFakeGradle({ args: invocation.args, cwd: invocation.options.cwd });
  } catch (error) {
    run = { status: 1, stdout: '', stderr: `${messageOf(error)}\n` };
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

export function spawnFakeGradle(
  command: string,
  args: readonly string[],
  options: SpawnSyncOptionsWithStringEncoding,
): SpawnSyncReturns<string> {
  if (command !== process.execPath || args[0] !== SUPERVISOR) {
    return spawnSync(command, args, options);
  }
  const invocation = invocationOf(parseJson(textOf(options.input)));
  if (invocation.command !== fakeGradle) {
    return spawnSync(command, args, options);
  }
  return {
    pid: 0,
    output: [],
    status: 0,
    signal: noSignal(),
    stdout: JSON.stringify(answerOf(invocation)),
    stderr: '',
  };
}

export const fakeGradleRun = { gradle: fakeGradle, spawn: spawnFakeGradle };
