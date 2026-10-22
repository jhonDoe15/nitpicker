import { spawnSync } from 'node:child_process';
import { writeSync } from 'node:fs';
import path from 'node:path';
import { fakeJdkTools, runFakeJdk } from './fake-jdk.mjs';
import { fakeMavenCommand, runFakeMaven } from './fake-maven.mjs';

const STDOUT = 1;

function run(command, args, options) {
  if (command === fakeMavenCommand) {
    return runFakeMaven({ args, cwd: options.cwd });
  }
  return runFakeJdk({ tool: path.basename(command), args, cwd: options.cwd });
}

function answerOf(command, args, options) {
  let answer;
  try {
    answer = run(command, args, options);
  } catch (error) {
    answer = { status: 1, stdout: '', stderr: `${error.message}\n` };
  }
  const descriptor = options.stdio?.[STDOUT];
  if (typeof descriptor === 'number') {
    writeSync(descriptor, answer.stdout);
    return { ...answer, stdout: '' };
  }
  return answer;
}

export function spawnFakeMaven(command, args, options) {
  if (command !== fakeMavenCommand && !fakeJdkTools.includes(path.basename(command))) {
    return spawnSync(command, args, options);
  }
  return { ...answerOf(command, args, options), signal: undefined, error: undefined };
}

export const fakeMavenRun = { maven: fakeMavenCommand, spawn: spawnFakeMaven };
