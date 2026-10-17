import { existsSync, watch } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function task(
  name,
  {
    dependencies = [],
    toleratedDependencyErrors,
    concurrencyWeight = 1,
    concurrencyGroup,
    executionPriority,
  } = {},
) {
  return {
    name,
    dependencies,
    ...(toleratedDependencyErrors === undefined ? {} : { toleratedDependencyErrors }),
    concurrencyWeight,
    concurrencyGroup,
    executionPriority,
    timeoutMs: 1_000,
    acceptedExitCodes: [0],
    invocation: {
      command: process.execPath,
      args: ['--version'],
      cwd: fileURLToPath(new URL('../../', import.meta.url)),
    },
  };
}

const SCHEDULING_TURNS = [1, 2, 3, 4];

export async function flushScheduling() {
  for (const turn of SCHEDULING_TURNS) {
    await Promise.resolve(turn);
  }
}

export function waitForFile(filePath) {
  if (existsSync(filePath)) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const watcher = watch(path.dirname(filePath), () => {
      if (existsSync(filePath)) {
        watcher.close();
        resolve();
      }
    });
    if (existsSync(filePath)) {
      watcher.close();
      resolve();
    }
  });
}
