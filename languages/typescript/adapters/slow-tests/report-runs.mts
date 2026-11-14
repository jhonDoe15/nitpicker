import { existsSync, realpathSync } from 'node:fs';
import path from 'node:path';

import type { TestFileResult, TestReport } from '../test-runners/typed/runner-types.mts';
import type { TestRunTime } from './slow-test-rules.mts';

const MILLISECONDS = 1000;

export function runKey({ file, name }: Pick<TestRunTime, 'file' | 'name'>): string {
  return `${file}\0${name}`;
}

function projectRoots(projectRoot: string): string[] {
  return existsSync(projectRoot)
    ? [...new Set([projectRoot, realpathSync(projectRoot)])]
    : [projectRoot];
}

function projectFile(projectRoot: string, name: unknown): string | undefined {
  const relatives = projectRoots(projectRoot).map((root) =>
    path.relative(root, String(name)).replaceAll('\\', '/'),
  );
  return relatives.find((relative) => !(relative.startsWith('..') || path.isAbsolute(relative)));
}

export function passedRuns(report: TestReport | undefined, projectRoot: string): TestRunTime[] {
  const results: readonly TestFileResult[] = Array.isArray(report?.testResults)
    ? report.testResults
    : [];
  return results.flatMap((result) =>
    (result.assertionResults ?? []).flatMap((run) => {
      const file = projectFile(projectRoot, result.name);
      return run.status === 'passed' &&
        typeof run.duration === 'number' &&
        Number.isFinite(run.duration) &&
        file !== undefined
        ? [{ file, name: String(run.fullName ?? run.title), seconds: run.duration / MILLISECONDS }]
        : [];
    }),
  );
}
