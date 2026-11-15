import { existsSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { containedPath } from '../../../core/fix/common/contained-path.mjs';
import { ingestCoverageBranches } from '../ingest/coverage-reports/coverage-branches.mts';
import { ingestCoverageJson } from '../ingest/coverage-reports/coverage-json.mts';
import { withoutLineNumbers } from '../ingest/typed/type-check-views.mts';
import { ingestRulesReport } from '../ingest/rules-report.mts';
import { RULES_TOOL } from '../rules/rule-hints.mjs';
import { PYTHON_ANALYZER_NAME } from './python-analyzer.mjs';
import { applyPythonExceptions } from './configuration/python-exceptions.mts';
import type { ExceptionEntry } from './configuration/python-exceptions.mts';
import { RULES_REPORT, readRegexSites } from './analysis/python-ast-rules.mjs';
import { FORMAT_REPORT, MANIFEST_REPORT, RUFF_REPORT } from './python-tools.mjs';
import { COVERAGE_REPORT } from './test-runs/test-step.mjs';
import { TYPES_REPORT } from './python-types.mjs';
import { isGeneratedPython } from '../libraries/generated-files.mjs';
import { readFactImports } from './facts/python-facts.mjs';
import { formatFindings, noTestsFinding, typeFindings } from './typed/report/report-ingest.mts';
import type {
  AllowedSite,
  CrapInput,
  FindingsReport,
  IngestedFinding,
  PythonModule,
  ReadFindingsOptions,
  RuffExtras,
  RuffInput,
  RunInput,
  SarifResult,
  ShapeInput,
} from './typed/report/report-types.mts';
import {
  applyRuleHints,
  cycleFindings,
  designFindings,
  detectLibraries,
  listProductionModules,
  moduleImportsSection,
  outsideRootsFindings,
  prepareSarif,
  pythonClassLimitFindings,
  pythonFeatureAnalysis,
  pythonFileLimitFindings,
  pythonFolderDepthFindings,
  pythonPersistence,
  readAllowances,
  readClassesReport,
  readConsoleFindings,
  readCouplingFindings,
  readDependencyFindings,
  readDuplicateFindings,
  readFactFindings,
  readImportLinterFindings,
  readImportsReport,
  readManifest,
  readPythonCrapFindings,
  pytestStyle,
  readPythonFunctions,
  readPythonStructureFindings,
  readSlowTestFindings,
  readStructureFunctions,
  readTestFiles,
  readTestRuntimeFindings,
  readTypesReport,
  sarifFindings,
  testFailureFindings,
  withUtf16Columns,
  withoutAllowedForms,
  withoutFrameworkForms,
} from './typed/report/report-views.mts';

const COLUMN_UNITS = { ruff: 'code-points', mypy: 'ascii-only' };

function readReport(reportRoot: string, name: string): string {
  return readFileSync(containedPath(reportRoot, name), 'utf8');
}

function readSource(projectRoot: string, file: string): string | undefined {
  const base = path.resolve(projectRoot);
  const absolute = path.resolve(base, file);
  if (!absolute.startsWith(base + path.sep)) {
    return undefined;
  }
  return existsSync(absolute) ? readFileSync(absolute, 'utf8') : undefined;
}

function readRuffFindings({
  reportRoot,
  roots,
  projectRoot,
  exceptions,
}: RuffInput): IngestedFinding[] {
  return ruffFindings(JSON.parse(readReport(reportRoot, RUFF_REPORT)), {
    roots,
    projectRoot,
    testFiles: readTestFiles(reportRoot),
    exceptions,
    ...readAllowances(reportRoot),
  });
}

function crapFindings({
  reportRoot,
  coverage,
  projectRoot,
  roots,
  crapLimit,
}: CrapInput): IngestedFinding[] {
  return readPythonCrapFindings({
    functions: readPythonFunctions(reportRoot),
    coverage,
    projectRoot,
    roots,
    crapLimit,
  });
}

export function readPythonFindings({
  projectRoot,
  reportRoot,
  crapLimit,
  policy = {},
  exceptions = [],
}: ReadFindingsOptions): FindingsReport {
  const manifest = readManifest(readReport(reportRoot, MANIFEST_REPORT));
  const roots = [...new Set([path.resolve(projectRoot), realpathSync(projectRoot)])];
  const imports = readImportsReport(reportRoot);
  const libraries = { ...detectLibraries(projectRoot), pytestStyle: pytestStyle(projectRoot) };
  const found = applyRuleHints(
    [
      ...readRuffFindings({ reportRoot, roots, projectRoot, exceptions }),
      ...formatFindings(readReport(reportRoot, FORMAT_REPORT), { roots, manifest }),
      ...typeFindings(readTypesReport(readReport(reportRoot, TYPES_REPORT)), roots),
      ...ingestRulesReport(readReport(reportRoot, RULES_REPORT), libraries),
      ...ingestRulesReport(readRegexSites(reportRoot), libraries),
      ...readPythonStructureFindings(reportRoot, projectRoot),
      ...pythonFileLimitFindings(projectRoot, policy),
      ...testRunFindings({ manifest, reportRoot, projectRoot, roots, crapLimit }),
      ...readDuplicateFindings(reportRoot, projectRoot),
      ...readCouplingFindings(reportRoot, { layout: policy.layout }),
      ...readImportLinterFindings(reportRoot),
      ...readTestRuntimeFindings({ reportRoot, projectRoot, runner: manifest.testRunner }),
      ...(manifest.quick ? [] : testFailureFindings(manifest, policy.snapshot)),
      ...projectShapeFindings({ projectRoot, reportRoot, policy, imports, manifest }),
      ...readConsoleFindings(reportRoot, { projectRoot, manifest }),
      ...readFactFindings(reportRoot, policy),
    ],
    libraries,
  );
  const findings = withUtf16Columns(withoutFrameworkForms(found, projectRoot, imports), {
    units: COLUMN_UNITS,
    readSource: (file: string) => readSource(projectRoot, file),
  });
  return { findings, ...moduleImportsSection(readFactImports(reportRoot), policy.history) };
}

function testRunFindings({
  manifest,
  reportRoot,
  projectRoot,
  roots,
  crapLimit,
}: RunInput): IngestedFinding[] {
  if (manifest.quick) {
    return [];
  }
  const coverage = readReport(reportRoot, COVERAGE_REPORT);
  return [
    ...ingestCoverageJson(coverage, { roots }).findings,
    ...crapFindings({ reportRoot, coverage, projectRoot, roots, crapLimit }),
    ...(manifest.testsRan === false ? [noTestsFinding()] : []),
    ...ingestCoverageBranches(coverage, {
      roots,
      functions: readStructureFunctions(reportRoot),
      sourceText: (file: string) => readSource(projectRoot, file),
    }).findings,
  ];
}

function sizedModules<T extends { file: string }>(projectRoot: string, modules: readonly T[]): T[] {
  return modules.filter(({ file }) => !isGeneratedPython(projectRoot, file));
}

function baseModules(
  baselineRoot: string | undefined,
  sourceRoots: readonly string[],
): PythonModule[] | undefined {
  return baselineRoot === undefined
    ? undefined
    : sizedModules(baselineRoot, listProductionModules(baselineRoot, sourceRoots));
}

function projectShapeFindings({
  projectRoot,
  reportRoot,
  policy,
  imports,
  manifest,
}: ShapeInput): IngestedFinding[] {
  const limits = { thresholds: policy.fileLimits ?? {}, exceptions: policy.exceptions ?? [] };
  const classes = readClassesReport(reportRoot);
  const features = pythonFeatureAnalysis(imports, {
    policy,
    isGenerated: (file: string) => isGeneratedPython(projectRoot, file),
    persistence: pythonPersistence(imports, { classes, projectRoot }),
  });
  return [
    ...(manifest.quick
      ? []
      : readSlowTestFindings({
          reportRoot,
          projectRoot,
          limits: policy.testSeconds,
          baselineRoot: policy.baselineRoot,
          snapshot: policy.snapshot,
          testRunner: manifest.testRunner,
          testsRan: manifest.testsRan,
        })),
    ...pythonFolderDepthFindings(sizedModules(projectRoot, imports.modules), {
      ...limits,
      tests: sizedModules(projectRoot, imports.others ?? []).filter(({ kind }) => kind === 'test'),
      sourceRoots: manifest.sourceRoots ?? [],
      rootModules: baseModules(policy.baselineRoot, manifest.sourceRoots ?? []),
    }),
    ...pythonClassLimitFindings(classes, imports.modules, limits),
    ...features.findings,
    ...cycleFindings(imports, features),
    ...outsideRootsFindings(imports),
    ...readDependencyFindings({ reportRoot, projectRoot, snapshot: policy.snapshot }),
    ...designFindings({
      reportRoot,
      analyzerName: PYTHON_ANALYZER_NAME,
      headPolicy: policy.headPolicy,
    }),
  ];
}

function sourceLine(projectRoot: string, file: string, line: number): string | undefined {
  return readSource(projectRoot, file)?.split(/\r?\n/u)[line - 1];
}

const RUFF_CODE = /^[A-Z]+\d+$/u;

function ownerSurvives(exceptions: readonly ExceptionEntry[]) {
  return ({ owner, path: file, line }: AllowedSite): boolean =>
    owner === undefined ||
    applyPythonExceptions(
      [
        {
          tool: RUFF_CODE.test(owner) ? 'ruff' : RULES_TOOL,
          rule: owner,
          path: file,
          location: { line },
        },
      ],
      exceptions,
    ).length > 0;
}

export function ruffFindings(
  log: unknown,
  {
    roots,
    projectRoot,
    testFiles = [],
    supportFiles = [],
    allowed = [],
    exceptions = [],
  }: RuffExtras & { readonly roots: readonly string[]; readonly projectRoot: string },
): IngestedFinding[] {
  const prepared = prepareSarif(log, {
    roots,
    sourceRoots: [],
    projectRoot,
    identityKey: (result: SarifResult) => withoutLineNumbers(result.message?.text ?? ''),
  });
  return withoutAllowedForms(sarifFindings(prepared), {
    testFiles,
    supportFiles,
    allowed,
    lineOf: (file: string, line: number) => sourceLine(projectRoot, file, line),
    keepsOwner: ownerSurvives(exceptions),
  });
}

export { typeFindings };
