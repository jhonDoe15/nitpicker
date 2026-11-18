import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fieldsOf } from '../../../../shared/values/readers.mts';
import { run } from '../execution/go-process.mts';
import { inspectCommand } from '../execution/go-tools.mts';
import type { GoContext, InspectReport } from '../go-types.mts';

const INSPECT_REPORT = 'inspect.json';
const BASE_INSPECT_REPORT = 'inspect-base.json';
const EMPTY: InspectReport = {
  files: [],
  functions: [],
  types: [],
  tests: [],
  branches: [],
  errors: [],
  definitions: [],
  usages: [],
  docComments: [],
  skipped: [],
  design: { types: [], callables: [] },
};

function runInspect(context: GoContext, root: string, report: string) {
  run(context, [inspectCommand(context), root, report], { rule: 'go-inspect-failed' });
}

export function inspect(context: GoContext): void {
  runInspect(context, context.projectRoot, path.join(context.reportRoot, INSPECT_REPORT));
}

function readReport(file: string): InspectReport {
  return existsSync(file)
    ? { ...EMPTY, ...fieldsOf(JSON.parse(readFileSync(file, 'utf8'))) }
    : EMPTY;
}

export function readInspect(reportRoot: string): InspectReport {
  return readReport(path.join(reportRoot, INSPECT_REPORT));
}

export function inspectBaseline(context: GoContext): InspectReport | undefined {
  if (context.baselineRoot === undefined || !existsSync(context.baselineRoot)) {
    return undefined;
  }
  const report = path.join(context.reportRoot, BASE_INSPECT_REPORT);
  if (!existsSync(report)) {
    runInspect(context, context.baselineRoot, report);
  }
  return readReport(report);
}
