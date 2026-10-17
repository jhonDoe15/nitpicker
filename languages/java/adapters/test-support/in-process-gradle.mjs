import path from 'node:path';
import { afterEach, beforeEach, vi } from 'vitest';
import { processes } from '../../../../core/tooling/processes.mjs';
import { runFakeGradle } from '../fixtures/fake-gradle.mjs';

export const fakeGradle = path.resolve(import.meta.dirname, '../fixtures/fake-gradle.mjs');

function spawnFakeGradle(realSpawn) {
  return (command, args, options) => {
    if (command !== fakeGradle) {
      return realSpawn(command, args, options);
    }
    const { status, stdout, stderr } = runFakeGradle({ args, cwd: options.cwd });
    return { status, signal: undefined, stdout, stderr, error: undefined };
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
