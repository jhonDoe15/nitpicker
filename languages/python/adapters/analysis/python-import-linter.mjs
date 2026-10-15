import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { importLinterCompleted, ingestImportLinter } from '../../ingest/import-linter.mjs';
import { readImportsReport } from './python-coupling.mjs';

const IMPORT_LINTER_REPORT = 'import-linter.txt';
const IMPORT_LINTER_FAILED_RULE = 'import-linter-failed';
const CONFIG_FILES = [
  { file: '.importlinter', marker: /^\s*\[importlinter\]/m },
  { file: 'setup.cfg', marker: /^\s*\[importlinter\]/m },
  { file: 'tox.ini', marker: /^\s*\[importlinter\]/m },
  { file: 'pyproject.toml', marker: /^\s*\[tool\.importlinter\]/m },
];
const OUTPUT_TAIL_LENGTH = 3000;
const NOT_FOUND_HINT = ', or turn the contracts off with "python": { "importLinter": false }';

export function hasImportLinterConfig(projectRoot) {
  return CONFIG_FILES.some(
    ({ file, marker }) =>
      existsSync(path.join(projectRoot, file)) &&
      marker.test(readFileSync(path.join(projectRoot, file), 'utf8')),
  );
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
