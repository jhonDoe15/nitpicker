import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { writeFiles } from '../../../../../core/diff/git/test-support/fixture-files.mts';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from '../../test-runs/test-step.mts';
import { createToolContext } from '../../test-support/typed/tool-context.mts';
import {
  type ConsoleEntry as Entry,
  readConsoleReport,
} from '../../test-support/views/test-views.mts';

function sortedEntries(entries: readonly Entry[]): Entry[] {
  return entries.toSorted(
    (left: Entry, right: Entry) =>
      left.file.localeCompare(right.file) || left.test.localeCompare(right.test),
  );
}

type Files = Readonly<Record<string, string>>;

type ConsoleProjects = {
  consoleReport: (files: Files) => {
    root: string;
    report: { readonly entries: readonly Entry[] };
    outcome: Record<string, unknown>;
  };
  cleanup: () => void;
};

export function createConsoleProjects(): ConsoleProjects {
  const roots: string[] = [];

  function directoryWith(prefix: string, files: Readonly<Record<string, string>>): string {
    const root = realpathSync(mkdtempSync(path.join(tmpdir(), prefix)));
    roots.push(root);
    writeFiles(root, files);
    return root;
  }

  function consoleReport(files: Readonly<Record<string, string>>) {
    const root = directoryWith('nitpicker-pytest-report-', { 'pyproject.toml': '', ...files });
    const reportRoot = directoryWith('nitpicker-pytest-out-', {});
    const context = createToolContext({
      projectRoot: root,
      liveRoot: root,
      settings: { environment: 'path', testRunner: 'pytest', sourceRoots: ['src'] },
      reportRoot,
    });
    const outcome = test(context);
    const { report } = readConsoleReport(reportRoot);
    return { root, report: { ...report, entries: sortedEntries(report.entries) }, outcome };
  }

  function cleanup(): void {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  }

  return { consoleReport, cleanup };
}
