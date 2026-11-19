import { existsSync, watch } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AnalyzerTask } from '../tasks.mts';

type TaskOptions = {
  readonly dependencies?: readonly string[];
  readonly toleratedDependencyErrors?: readonly string[];
  readonly concurrencyWeight?: number;
  readonly concurrencyGroup?: string;
  readonly executionPriority?: number;
};

export function task(
  name: string,
  {
    dependencies = [],
    toleratedDependencyErrors,
    concurrencyWeight = 1,
    concurrencyGroup,
    executionPriority,
  }: TaskOptions = {},
): AnalyzerTask {
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

const SCHEDULING_TURNS = [1, 2, 3, 4, 5, 6, 7, 8];

export async function flushScheduling(): Promise<void> {
  for (const turn of SCHEDULING_TURNS) {
    await Promise.resolve(turn);
  }
}

export function waitForFile(filePath: string): Promise<void> {
  if (existsSync(filePath)) {
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
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

export type ScriptAnalyzer = {
  readonly name: string;
  readonly version: string;
  readonly configurationHash: string;
  readonly exclusions: readonly string[];
  readonly createInvocation: () => { readonly command: string; readonly args: readonly string[] };
};

export function scriptAnalyzer(name: string, script: string): ScriptAnalyzer {
  return {
    name,
    version: '1',
    configurationHash: 'h',
    exclusions: [],
    createInvocation: () => ({ command: process.execPath, args: ['--eval', script] }),
  };
}
