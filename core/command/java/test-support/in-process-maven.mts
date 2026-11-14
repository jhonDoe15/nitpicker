import { spawnSync } from 'node:child_process';
import { writeSync } from 'node:fs';
import path from 'node:path';
import type { SpawnOptions, ToolAnswer as Answer } from '../../test-support/fixture-types.mts';
import { fakeJdkTools, runFakeJdk } from './fake-jdk.mts';
import { fakeMavenCommand, runFakeMaven } from './fake-maven.mts';

const STDOUT = 1;

function run(command: string, args: string[], options: SpawnOptions): Answer {
  if (command === fakeMavenCommand) {
    return runFakeMaven({ args, cwd: options.cwd });
  }
  return runFakeJdk({ tool: path.basename(command), args, cwd: options.cwd });
}

function answerOf(command: string, args: string[], options: SpawnOptions): Answer {
  let answer: Answer;
  try {
    answer = run(command, args, options);
  } catch (error) {
    answer = {
      status: 1,
      stdout: '',
      stderr: `${error instanceof Error ? error.message : String(error)}\n`,
    };
  }
  const descriptor = options.stdio?.[STDOUT];
  if (typeof descriptor === 'number') {
    writeSync(descriptor, answer.stdout);
    return { ...answer, stdout: '' };
  }
  return answer;
}

export function spawnFakeMaven(command: string, args: string[], options: SpawnOptions): unknown {
  if (command !== fakeMavenCommand && !fakeJdkTools.includes(path.basename(command))) {
    return spawnSync(command, args, options);
  }
  return { ...answerOf(command, args, options), signal: undefined, error: undefined };
}

export const fakeMavenRun = { maven: fakeMavenCommand, spawn: spawnFakeMaven };
