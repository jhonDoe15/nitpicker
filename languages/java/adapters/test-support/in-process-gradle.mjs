import path from 'node:path';
import { afterEach, beforeEach, vi } from 'vitest';
import { processes } from '../../../../core/tooling/processes.mjs';
import { SUPERVISOR } from '../gradle-wrapper/gradle-process.mjs';
import { runFakeGradle } from '../fixtures/fake-gradle.mjs';

export const fakeGradle = path.resolve(import.meta.dirname, '../fixtures/fake-gradle.mjs');

function spawnFakeGradle(realSpawn) {
  return (command, args, options) => {
    if (command !== process.execPath || args[0] !== SUPERVISOR) {
      return realSpawn(command, args, options);
    }
    const invocation = JSON.parse(options.input);
    if (invocation.command !== fakeGradle) {
      return realSpawn(command, args, options);
    }
    const { status, stdout, stderr } = runFakeGradle({
      args: invocation.args,
      cwd: invocation.options.cwd,
    });
    return {
      status: 0,
      signal: null,
      stdout: JSON.stringify({ status, signal: null, stdout, stderr }),
      stderr: '',
    };
  };
}

export function useInProcessGradle() {
  beforeEach(() => {
    const realSpawn = processes.spawn;
    vi.spyOn(processes, 'spawn').mockImplementation(spawnFakeGradle(realSpawn));
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });
}
