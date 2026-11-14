import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { writeFiles } from '../../../../../core/diff/git/test-support/fixture-files.mjs';
import { ruffFindings } from '../../python-reports.mts';
import { lint, RUFF_REPORT } from '../../python-tools.mjs';
import { createToolContext } from '../../typed/runner/runner-views.mts';
import { parseJson } from '../../../../../shared/values/readers.mts';

type LintOptions = {
  readonly files: Readonly<Record<string, string>>;
  readonly policyFiles?: Readonly<Record<string, string>>;
  readonly toolPrecedence?: unknown;
  readonly conventions?: unknown;
  readonly exclude?: readonly string[];
};

type Roots = { projectRoot: string; policyRoot: string; reportRoot: string };

function temporaryRoot(): string {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-ruff-lint-')));
  mkdirSync(path.join(root, '.git'));
  return root;
}

function findingsIn(
  { files, policyFiles, toolPrecedence, conventions, exclude = [] }: LintOptions,
  roots: Roots,
): string[] {
  writeFiles(roots.projectRoot, files);
  writeFiles(roots.policyRoot, policyFiles ?? {});
  const context = createToolContext({
    projectRoot: roots.projectRoot,
    liveRoot: roots.projectRoot,
    settings: { environment: 'path', sourceRoots: ['src'] },
    reportRoot: roots.reportRoot,
    exclude,
    toolPrecedence,
    conventions,
    policyRoot: roots.policyRoot,
  });
  lint(context);
  const log = parseJson(readFileSync(path.join(roots.reportRoot, RUFF_REPORT), 'utf8'));
  return ruffFindings(log, { roots: [roots.projectRoot], projectRoot: roots.projectRoot })
    .map(({ rule, path: file }) => `${rule} ${file}`)
    .toSorted();
}

export function realLintFindings(options: LintOptions): string[] {
  const projectRoot = temporaryRoot();
  const roots = {
    projectRoot,
    policyRoot: options.policyFiles === undefined ? projectRoot : temporaryRoot(),
    reportRoot: temporaryRoot(),
  };
  try {
    return findingsIn(options, roots);
  } finally {
    for (const root of new Set(Object.values(roots))) {
      rmSync(root, { recursive: true, force: true });
    }
  }
}
