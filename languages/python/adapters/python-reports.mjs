import { readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { readDuplicateFindings } from '../../java/adapters/java-duplicates.mjs';
import { prepareSarif } from '../../java/adapters/java-reports.mjs';
import { normalizeReportPath } from '../../java/ingest/common.mjs';
import { ingestFormatCheck } from '../../java/ingest/format-check.mjs';
import { ingestSarif } from '../../java/ingest/sarif.mjs';
import { ingestCoverageJson } from '../ingest/coverage-json.mjs';
import { readCouplingFindings } from './python-coupling.mjs';
import { readImportLinterFindings } from './python-import-linter.mjs';
import { COVERAGE_REPORT, FORMAT_REPORT, MANIFEST_REPORT, RUFF_REPORT } from './python-tools.mjs';

const FORMATTER_TOOLS = { ruff: 'ruff-format', black: 'black' };

function readReport(reportRoot, name) {
  return readFileSync(path.join(reportRoot, name), 'utf8');
}

export function readPythonFindings({ projectRoot, reportRoot }) {
  const { formatter } = JSON.parse(readReport(reportRoot, MANIFEST_REPORT));
  const roots = [...new Set([path.resolve(projectRoot), realpathSync(projectRoot)])];
  return {
    findings: [
      ...ruffFindings(JSON.parse(readReport(reportRoot, RUFF_REPORT)), { roots, projectRoot }),
      ...formatFindings(readReport(reportRoot, FORMAT_REPORT), { roots, formatter }),
      ...ingestCoverageJson(readReport(reportRoot, COVERAGE_REPORT), { roots }).findings,
      ...readDuplicateFindings(reportRoot),
      ...readCouplingFindings(reportRoot),
      ...readImportLinterFindings(reportRoot),
    ],
  };
}

function ruffFindings(log, { roots, projectRoot }) {
  const prepared = prepareSarif(log, {
    roots,
    sourceRoots: [],
    projectRoot,
    identityKey: (result) => result.message?.text,
  });
  return ingestSarif(prepared, { tool: 'ruff' }).findings;
}

function formatFindings(text, { roots, formatter }) {
  const lines = text
    .split(/\r?\n/)
    .map(
      (line) =>
        roots
          .map((root) => normalizeReportPath(line.trim(), root))
          .find((candidate) => candidate !== undefined) ?? line,
    );
  return ingestFormatCheck(lines.join('\n'), {
    tool: FORMATTER_TOOLS[formatter],
    message: `File is not formatted with ${formatter}`,
  }).findings;
}
