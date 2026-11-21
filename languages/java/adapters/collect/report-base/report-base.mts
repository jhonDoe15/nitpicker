import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { attempt } from '../../../../../shared/values/attempt/attempt.mts';

type Remove = (directory: string) => void;

const REMOVE_OPTIONS = { recursive: true, force: true, maxRetries: 3, retryDelay: 100 };

function removeTree(directory: string): void {
  rmSync(directory, REMOVE_OPTIONS);
}

export function withoutReportBase(error: unknown, reportBase: string): unknown {
  return error instanceof Error && error.message.includes(reportBase)
    ? new Error(error.message.replaceAll(reportBase, '<report directory>'), { cause: error })
    : error;
}

export function withReportBase<T>(
  given: string | undefined,
  run: (reportBase: string) => T,
  remove: Remove = removeTree,
): T {
  const reportBase = given ?? mkdtempSync(path.join(tmpdir(), 'nitpicker-java-reports-'));
  try {
    return run(reportBase);
  } catch (error) {
    throw withoutReportBase(error, reportBase);
  } finally {
    if (given === undefined) {
      attempt(() => {
        remove(reportBase);
      });
    }
  }
}
