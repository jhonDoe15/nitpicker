import { existsSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { readDuplicateFindings } from './analysis/python-duplicates.mjs';
import { prepareSarif } from '../../java/ingest/sarif.mjs';
import { normalizeReportPath } from '../../java/ingest/common.mjs';
import { ingestFormatCheck } from '../../java/ingest/formatting/format-check.mjs';
import { ingestSarif } from '../../java/ingest/sarif.mjs';
import { ingestCoverageBranches } from '../ingest/coverage-reports/coverage-branches.mjs';
import { ingestCoverageJson } from '../ingest/coverage-reports/coverage-json.mjs';
import { PYTHON_ANALYZER_NAME } from './python-analyzer.mjs';
import { withoutLineNumbers } from '../ingest/identities.mjs';
import { ingestRulesReport } from '../ingest/rules-report.mjs';
import { ingestMypy, ingestPyright } from '../ingest/type-check.mjs';
import { applyRuleHints } from '../rules/rule-hints.mjs';
import { detectLibraries } from '../rules/libraries/project-libraries.mjs';
import { pytestStyle } from '../rules/libraries/pytest-style.mjs';
import { withoutAllowedForms } from '../rules/filters/ruff-allowed-forms.mjs';
import { RULES_REPORT, readTestFiles } from './analysis/python-ast-rules.mjs';
import { readPythonCrapFindings } from './mutation/python-crap.mjs';
import { readImportLinterFindings } from './analysis/python-import-linter.mjs';
import {
  pythonFileLimitFindings,
  readPythonFunctions,
  readPythonStructureFindings,
} from './analysis/python-structure.mjs';
import { FORMAT_REPORT, MANIFEST_REPORT, RUFF_REPORT } from './python-tools.mjs';
import { COVERAGE_REPORT } from './test-runs/test-step.mjs';
import { testFailureFindings } from './test-runs/test-failures.mjs';
import { readSlowTestFindings } from './test-runs/slow-tests.mjs';
import { readCouplingFindings, readImportsReport } from './analysis/python-coupling.mjs';
import { cycleFindings, outsideRootsFindings } from './imports/python-import-rules.mjs';
import {
  pythonClassLimitFindings,
  pythonFolderDepthFindings,
  readClassesReport,
} from './size/python-size.mjs';
import { readDependencyFindings } from './dependencies/dependency-findings.mjs';
import { withoutFrameworkForms } from './dependencies/python-frameworks.mjs';
import { TYPES_REPORT } from './python-types.mjs';
import { listProductionModules } from './analysis/python-sources.mjs';
import { isGeneratedPython } from '../libraries/generated-files.mjs';

const FORMATTER_TOOLS = { ruff: 'ruff-format', black: 'black' };
const NO_TESTS_RULE = 'no-tests-ran';

function readReport(reportRoot, name) {
  return readFileSync(path.join(reportRoot, name), 'utf8');
}

function readSource(projectRoot, file) {
  const absolute = path.join(projectRoot, file);
  return existsSync(absolute) ? readFileSync(absolute, 'utf8') : undefined;
}

export function readPythonFindings({ projectRoot, reportRoot, crapLimit, policy = {} }) {
  const manifest = JSON.parse(readReport(reportRoot, MANIFEST_REPORT));
  const roots = [...new Set([path.resolve(projectRoot), realpathSync(projectRoot)])];
  const coverage = readReport(reportRoot, COVERAGE_REPORT);
  const imports = readImportsReport(reportRoot);
  const libraries = { ...detectLibraries(projectRoot), pytestStyle: pytestStyle(projectRoot) };
  const found = applyRuleHints(
    [
      ...ruffFindings(JSON.parse(readReport(reportRoot, RUFF_REPORT)), {
        roots,
        projectRoot,
        testFiles: readTestFiles(reportRoot),
      }),
      ...formatFindings(readReport(reportRoot, FORMAT_REPORT), { roots, manifest }),
      ...typeFindings(JSON.parse(readReport(reportRoot, TYPES_REPORT)), roots),
      ...ingestRulesReport(readReport(reportRoot, RULES_REPORT), libraries),
      ...ingestCoverageJson(coverage, { roots }).findings,
      ...readPythonStructureFindings(reportRoot, projectRoot),
      ...pythonFileLimitFindings(projectRoot, policy),
      ...readPythonCrapFindings({
        functions: readPythonFunctions(reportRoot),
        coverage,
        projectRoot,
        roots,
        crapLimit,
      }),
      ...(manifest.testsRan === false ? [noTestsFinding()] : []),
      ...ingestCoverageBranches(readReport(reportRoot, COVERAGE_REPORT), {
        roots,
        sourceText: (file) => readSource(projectRoot, file),
      }).findings,
      ...readDuplicateFindings(reportRoot),
      ...readCouplingFindings(reportRoot),
      ...readImportLinterFindings(reportRoot),
      ...testFailureFindings(manifest, policy.snapshot),
      ...projectShapeFindings({ projectRoot, reportRoot, policy, imports, manifest }),
    ],
    libraries,
  );
  return { findings: withoutFrameworkForms(found, projectRoot, imports) };
}

function sizedModules(projectRoot, modules) {
  return modules.filter(({ file }) => !isGeneratedPython(projectRoot, file));
}

function baseModules(baselineRoot, sourceRoots) {
  return baselineRoot === undefined
    ? undefined
    : sizedModules(baselineRoot, listProductionModules(baselineRoot, sourceRoots));
}

function projectShapeFindings({ projectRoot, reportRoot, policy, imports, manifest }) {
  const limits = { thresholds: policy.fileLimits ?? {}, exceptions: policy.exceptions ?? [] };
  return [
    ...readSlowTestFindings({
      reportRoot,
      projectRoot,
      limits: policy.testSeconds,
      baselineRoot: policy.baselineRoot,
      snapshot: policy.snapshot,
      testRunner: manifest.testRunner,
      testsRan: manifest.testsRan,
    }),
    ...pythonFolderDepthFindings(sizedModules(projectRoot, imports.modules), {
      ...limits,
      tests: sizedModules(projectRoot, imports.others ?? []).filter(({ kind }) => kind === 'test'),
      sourceRoots: manifest.sourceRoots ?? [],
      rootModules: baseModules(policy.baselineRoot, manifest.sourceRoots ?? []),
    }),
    ...pythonClassLimitFindings(readClassesReport(reportRoot), imports.modules, limits),
    ...cycleFindings(imports),
    ...outsideRootsFindings(imports),
    ...readDependencyFindings({ reportRoot, projectRoot, snapshot: policy.snapshot }),
  ];
}

function sourceLine(projectRoot, file, line) {
  return readSource(projectRoot, file)?.split(/\r?\n/u)[line - 1];
}

export function ruffFindings(log, { roots, projectRoot, testFiles = [] }) {
  const prepared = prepareSarif(log, {
    roots,
    sourceRoots: [],
    projectRoot,
    identityKey: (result) => withoutLineNumbers(result.message?.text ?? ''),
  });
  return withoutAllowedForms(ingestSarif(prepared, { tool: 'ruff' }).findings, {
    testFiles,
    lineOf: (file, line) => sourceLine(projectRoot, file, line),
  });
}

const TYPE_INGESTERS = {
  mypy: (output, roots) => ingestMypy(output, { roots }),
  pyright: (output, roots) => ingestPyright(output, { roots }),
  basedpyright: (output, roots) => ingestPyright(output, { roots, tool: 'basedpyright' }),
};

export function typeFindings({ checker, output }, roots) {
  return TYPE_INGESTERS[checker](output, roots);
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
