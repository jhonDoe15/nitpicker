import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { writeFiles } from '../../../../../core/diff/git/test-support/fixture-files.mts';
import { typeFindings } from '../../python-reports.mts';
import {
  createToolContext,
  type ToolContextOptions,
} from '../../test-support/typed/tool-context.mts';
import { readTypesReport } from '../../typed/report/report-views.mts';
import { TYPES_REPORT, typeCheck } from '../../python-types.mts';

type TypeOptions = {
  readonly files: Readonly<Record<string, string>>;
  readonly checker?: string;
  readonly toolPrecedence?: ToolContextOptions['toolPrecedence'];
  readonly settings?: Readonly<Record<string, unknown>>;
  readonly exclude?: readonly string[];
};

function temporaryRoot(): string {
  return realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-type-tools-')));
}

function findingsIn(
  { files, checker, toolPrecedence, settings, exclude = [] }: TypeOptions,
  projectRoot: string,
  reportRoot: string,
): string[] {
  writeFiles(projectRoot, files);
  const context = createToolContext({
    projectRoot,
    liveRoot: projectRoot,
    settings: { environment: 'path', sourceRoots: ['src'], typeChecker: checker, ...settings },
    reportRoot,
    exclude,
    toolPrecedence,
    policyRoot: projectRoot,
  });
  typeCheck(context);
  const report = readTypesReport(readFileSync(path.join(reportRoot, TYPES_REPORT), 'utf8'));
  return typeFindings(report, [projectRoot]).map(
    ({ rule, path: file }) => `${rule} ${path.basename(file)}`,
  );
}

export function realTypeFindings({
  settings = {},
  exclude = [],
  ...options
}: TypeOptions): string[] {
  const projectRoot = temporaryRoot();
  const reportRoot = temporaryRoot();
  try {
    return findingsIn({ ...options, settings, exclude }, projectRoot, reportRoot);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
    rmSync(reportRoot, { recursive: true, force: true });
  }
}
