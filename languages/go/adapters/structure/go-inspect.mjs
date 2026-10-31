import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { run } from '../execution/go-process.mjs';
import { inspectCommand } from '../execution/go-tools.mjs';

const INSPECT_REPORT = 'inspect.json';
const BASE_INSPECT_REPORT = 'inspect-base.json';
const EMPTY = { files: [], functions: [], types: [], tests: [], errors: [] };

function runInspect(context, root, report) {
  run(context, [inspectCommand(context), root, report], { rule: 'go-inspect-failed' });
}

export function inspect(context) {
  runInspect(context, context.projectRoot, path.join(context.reportRoot, INSPECT_REPORT));
}

function readReport(file) {
  return existsSync(file) ? { ...EMPTY, ...JSON.parse(readFileSync(file, 'utf8')) } : EMPTY;
}

export function readInspect(reportRoot) {
  return readReport(path.join(reportRoot, INSPECT_REPORT));
}

export function inspectBaseline(context) {
  if (context.baselineRoot === undefined || !existsSync(context.baselineRoot)) {
    return undefined;
  }
  const report = path.join(context.reportRoot, BASE_INSPECT_REPORT);
  if (!existsSync(report)) {
    runInspect(context, context.baselineRoot, report);
  }
  return readReport(report);
}
