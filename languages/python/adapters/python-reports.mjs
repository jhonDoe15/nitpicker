import { readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { readDuplicateFindings } from './python-duplicates.mjs';
import { prepareSarif } from '../../java/adapters/java-reports.mjs';
import { normalizeReportPath } from '../../java/ingest/common.mjs';
import { ingestFormatCheck } from '../../java/ingest/format-check.mjs';
import { ingestSarif } from '../../java/ingest/sarif.mjs';
import { ingestCoverageJson } from '../ingest/coverage-json.mjs';
import { PYTHON_ANALYZER_NAME } from './python-analyzer.mjs';
import { readCouplingFindings } from './python-coupling.mjs';
import { LIZARD_REPORT, readPythonCrapFindings } from './python-crap.mjs';
import { readImportLinterFindings } from './python-import-linter.mjs';
import { readPythonStructureFindings } from './python-structure.mjs';
import { COVERAGE_REPORT, FORMAT_REPORT, MANIFEST_REPORT, RUFF_REPORT } from './python-tools.mjs';

const FORMATTER_TOOLS = { ruff: 'ruff-format', black: 'black' };
const NO_TESTS_RULE = 'no-tests-ran';
const EXCLUDE_HINT = 'Not wanted here? Add the path to "exclude" in nitpicker.config.json.';
const LIFTABLE_RULES = new Set(['T201', 'PERF203']);

function readReport(reportRoot, name) {
  return readFileSync(path.join(reportRoot, name), 'utf8');
}

export function readPythonFindings({ projectRoot, reportRoot, crapLimit }) {
  const manifest = JSON.parse(readReport(reportRoot, MANIFEST_REPORT));
  const roots = [...new Set([path.resolve(projectRoot), realpathSync(projectRoot)])];
  const coverage = readReport(reportRoot, COVERAGE_REPORT);
  return {
    findings: [
      ...ruffFindings(JSON.parse(readReport(reportRoot, RUFF_REPORT)), { roots, projectRoot }),
      ...formatFindings(readReport(reportRoot, FORMAT_REPORT), { roots, manifest }),
      ...ingestCoverageJson(coverage, { roots }).findings,
      ...readPythonStructureFindings(reportRoot, projectRoot),
      ...readPythonCrapFindings({
        lizard: readReport(reportRoot, LIZARD_REPORT),
        coverage,
        projectRoot,
        roots,
        crapLimit,
      }),
      ...(manifest.testsRan === false ? [noTestsFinding()] : []),
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
  return ingestSarif(prepared, { tool: 'ruff' }).findings.map(withExcludeHint);
}

function withExcludeHint(finding) {
  return LIFTABLE_RULES.has(finding.rule)
    ? { ...finding, message: `${finding.message} ${EXCLUDE_HINT}` }
    : finding;
}

function noTestsFinding() {
  return {
    tool: PYTHON_ANALYZER_NAME,
    rule: NO_TESTS_RULE,
    path: '.',
    identity: NO_TESTS_RULE,
    message: 'No tests ran. Keep the project tests, or restore the ones this change removed.',
    classification: 'enforceable',
  };
}

function formatMessage({ formatter, formatterDetected }) {
  const base = `File is not formatted with ${formatter}`;
  return formatterDetected ? `${base} (detected; set "python.formatter" if wrong)` : base;
}

function formatFindings(text, { roots, manifest }) {
  const lines = text
    .split(/\r?\n/)
    .map(
      (line) =>
        roots
          .map((root) => normalizeReportPath(line.trim(), root))
          .find((candidate) => candidate !== undefined) ?? line,
    );
  return ingestFormatCheck(lines.join('\n'), {
    tool: FORMATTER_TOOLS[manifest.formatter],
    message: formatMessage(manifest),
  }).findings;
}
