import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { importLinterCompleted, ingestImportLinter } from '../../ingest/import-linter.mjs';
import { attempt } from '../project-tools/project-tool-layers.mjs';
import { readImportLinterConfig } from './import-linter/import-linter-config.mjs';
import { readImportsReport } from './python-coupling.mjs';

const IMPORT_LINTER_REPORT = 'import-linter.txt';
const IMPORT_LINTER_FAILED_RULE = 'import-linter-failed';
const OUTPUT_TAIL_LENGTH = 3000;
const NOT_FOUND_HINT = ', or turn the contracts off with "python": { "importLinter": false }';

export function hasImportLinterConfig(projectRoot) {
  const { value, error } = attempt(() => readImportLinterConfig(projectRoot));
  return error !== undefined || value !== undefined;
}

export function importLinterEnabled(projectRoot, setting) {
  return setting ?? hasImportLinterConfig(projectRoot);
}

export function runImportLinter(context, run) {
  if (!importLinterEnabled(context.projectRoot, context.project.importLinter)) {
    return;
  }
  const result = run(context, ['lint-imports', '--no-cache'], {
    accepted: [0, 1],
    rule: IMPORT_LINTER_FAILED_RULE,
    notFoundHint: NOT_FOUND_HINT,
  });
  if (!importLinterCompleted(result.stdout)) {
    const output = `${result.stdout}\n${result.stderr}`.trim() || 'no diagnostic output';
    throw Object.assign(
      new Error(
        `lint-imports could not check the contracts:\n${output.slice(-OUTPUT_TAIL_LENGTH)}`,
      ),
      { rule: IMPORT_LINTER_FAILED_RULE },
    );
  }
  writeFileSync(path.join(context.reportRoot, IMPORT_LINTER_REPORT), result.stdout);
}

export function readImportLinterFindings(reportRoot) {
  const report = path.join(reportRoot, IMPORT_LINTER_REPORT);
  if (!existsSync(report)) {
    return [];
  }
  const files = new Map(readImportsReport(reportRoot).modules.map((m) => [m.module, m.file]));
  return ingestImportLinter(readFileSync(report, 'utf8'), { files }).findings;
}
