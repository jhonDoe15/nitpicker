import {
  fieldOf,
  fieldsOf,
  listOf,
  parseJson,
  textOf,
  textsOf,
} from '../../../../../shared/values/readers.mts';
import { readDuplicateFindings as untypedDuplicates } from '../../analysis/python-duplicates.mjs';
import {
  ingestSarif as untypedIngestSarif,
  prepareSarif as untypedPrepareSarif,
} from '../../../../../shared/ingest/sarif.mjs';
import { readStructureFunctions as untypedStructureFunctions } from '../../../../../shared/ingest/structure-report.mjs';
import { withUtf16Columns as untypedUtf16Columns } from '../../../../../shared/ingest/columns/utf16-columns.mjs';
import { moduleImportsSection as untypedModuleImports } from '../../../../../shared/history/co-change/dependencies/module-imports.mjs';
import { applyRuleHints as untypedRuleHints } from '../../../rules/rule-hints.mjs';
import { detectLibraries as untypedLibraries } from '../../../rules/libraries/project-libraries.mjs';
import { pytestStyle as untypedPytestStyle } from '../../../rules/libraries/pytest-style.mjs';
import { withoutAllowedForms as untypedAllowedForms } from '../../../rules/filters/ruff-allowed-forms.mts';
import { readConsoleFindings as untypedConsole } from '../../test-results/console-output.mjs';
import { readFactFindings as untypedFacts } from '../../facts/python-facts.mjs';
import { readTestRuntimeFindings as untypedTestRuntime } from '../../analysis/test-runtime/python-test-runtime.mjs';
import { readImportLinterFindings as untypedImportLinter } from '../../analysis/python-import-linter.mjs';
import {
  readCouplingFindings as untypedCoupling,
  readImportsReport as untypedImportsReport,
} from '../../analysis/python-coupling.mjs';
import {
  readPythonStructureFindings as untypedStructure,
  pythonFileLimitFindings as untypedFileLimits,
  readPythonFunctions as untypedFunctions,
} from '../../analysis/python-structure.mjs';
import {
  readAllowances as untypedAllowances,
  readTestFiles as untypedTestFiles,
} from '../../analysis/python-ast-rules.mjs';
import { readSlowTestFindings as untypedSlowTests } from '../../test-runs/slow-tests.mjs';
import { testFailureFindings as untypedTestFailures } from '../../test-runs/test-failures.mjs';
import { pythonFeatureAnalysis as untypedFeatures } from '../../imports/python-feature-facts.mjs';
import { readDependencyFindings as untypedDependencies } from '../../dependencies/dependency-findings.mjs';
import { withoutFrameworkForms as untypedFrameworkForms } from '../../dependencies/python-frameworks.mjs';
import { listProductionModules as untypedProductionModules } from '../../analysis/python-sources.mjs';
import {
  cycleFindings as untypedCycles,
  outsideRootsFindings as untypedOutsideRoots,
} from '../../imports/python-import-rules.mts';
import {
  pythonClassLimitFindings as untypedClassLimits,
  pythonFolderDepthFindings as untypedFolderDepth,
  readClassesReport as untypedClasses,
} from '../../size/python-size.mts';
import { pythonPersistence as untypedPersistence } from '../../persistence/python-persistence.mts';
import { designFindings as untypedDesign } from '../../analysis/design/python-design.mts';
import { callUntyped as call } from '../../../../../shared/values/boundaries/untyped-call.mts';
import { isFinding } from './finding-guards.mts';
import { readPythonCrapFindings as untypedCrap } from '../../mutation/python-crap.mts';
import type {
  IngestedFinding,
  ImportsReport,
  Manifest,
  PythonModule,
  ReportPolicy,
  TypesReport,
} from './report-types.mts';

export type Features = { readonly findings: readonly IngestedFinding[] };
export type Options = Readonly<Record<string, unknown>>;
export type Libraries = Readonly<Record<string, unknown>>;

function findingsOf(value: unknown): IngestedFinding[] {
  return listOf(value).filter(isFinding);
}

function isImportsReport(value: unknown): value is ImportsReport {
  return Array.isArray(fieldOf(value, 'modules')) && typeof fieldOf(value, 'imports') === 'object';
}

function isFeatures(value: unknown): value is Features {
  return Array.isArray(fieldOf(value, 'findings'));
}

function isModule(value: unknown): value is PythonModule {
  return typeof fieldOf(value, 'file') === 'string';
}

export function readTestFiles(reportRoot: string): string[] {
  return textsOf(call(untypedTestFiles, reportRoot));
}

export function readAllowances(reportRoot: string): {
  supportFiles: string[];
  allowed: readonly unknown[];
} {
  const read = call(untypedAllowances, reportRoot);
  return {
    supportFiles: textsOf(fieldOf(read, 'supportFiles')),
    allowed: listOf(fieldOf(read, 'allowed')),
  };
}

export function readPythonFunctions(reportRoot: string): unknown {
  return call(untypedFunctions, reportRoot);
}

export function readImportsReport(reportRoot: string): ImportsReport {
  const report = call(untypedImportsReport, reportRoot);
  if (!isImportsReport(report)) {
    throw new Error('The imports report is malformed');
  }
  return report;
}

export function detectLibraries(projectRoot: string): Libraries {
  return fieldsOf(call(untypedLibraries, projectRoot));
}

export function pytestStyle(projectRoot: string): unknown {
  return call(untypedPytestStyle, projectRoot);
}

export function applyRuleHints(
  findings: readonly IngestedFinding[],
  libraries: Libraries,
): IngestedFinding[] {
  return findingsOf(call(untypedRuleHints, findings, libraries));
}

export function readPythonStructureFindings(
  reportRoot: string,
  projectRoot: string,
): IngestedFinding[] {
  return findingsOf(call(untypedStructure, reportRoot, projectRoot));
}

export function pythonFileLimitFindings(
  projectRoot: string,
  policy: ReportPolicy,
): IngestedFinding[] {
  return findingsOf(call(untypedFileLimits, projectRoot, policy));
}

export function readDuplicateFindings(reportRoot: string, projectRoot: string): IngestedFinding[] {
  return findingsOf(call(untypedDuplicates, reportRoot, projectRoot));
}

export function readCouplingFindings(reportRoot: string, options: Options): IngestedFinding[] {
  return findingsOf(call(untypedCoupling, reportRoot, options));
}

export function readImportLinterFindings(reportRoot: string): IngestedFinding[] {
  return findingsOf(call(untypedImportLinter, reportRoot));
}

export function readTestRuntimeFindings(options: Options): IngestedFinding[] {
  return findingsOf(call(untypedTestRuntime, options));
}

export function testFailureFindings(manifest: Options, snapshot?: string): IngestedFinding[] {
  return findingsOf(call(untypedTestFailures, manifest, snapshot));
}

export function readConsoleFindings(reportRoot: string, options: Options): IngestedFinding[] {
  return findingsOf(call(untypedConsole, reportRoot, options));
}

export function readFactFindings(reportRoot: string, policy: ReportPolicy = {}): IngestedFinding[] {
  return findingsOf(call(untypedFacts, reportRoot, policy));
}

export function readSlowTestFindings(options: Options): IngestedFinding[] {
  return findingsOf(call(untypedSlowTests, options));
}

export function readDependencyFindings(options: Options): IngestedFinding[] {
  return findingsOf(call(untypedDependencies, options));
}

export function designFindings(options: Options): IngestedFinding[] {
  return findingsOf(call(untypedDesign, options));
}

export function withoutFrameworkForms(
  findings: readonly IngestedFinding[],
  projectRoot: string,
  imports: ImportsReport,
): IngestedFinding[] {
  return findingsOf(call(untypedFrameworkForms, findings, projectRoot, imports));
}

export function withUtf16Columns(
  findings: readonly IngestedFinding[],
  options: Options,
): IngestedFinding[] {
  return findingsOf(call(untypedUtf16Columns, findings, options));
}

export function moduleImportsSection(imports: unknown, history: unknown): Options {
  return fieldsOf(call(untypedModuleImports, imports, history));
}

export function withoutAllowedForms(
  findings: readonly IngestedFinding[],
  options: Options,
): IngestedFinding[] {
  return findingsOf(call(untypedAllowedForms, findings, options));
}

export function readStructureFunctions(reportRoot: string): readonly unknown[] {
  return listOf(call(untypedStructureFunctions, reportRoot));
}

export function listProductionModules(
  root: string,
  sourceRoots: readonly string[],
): PythonModule[] {
  return listOf(call(untypedProductionModules, root, sourceRoots)).filter(isModule);
}

export function prepareSarif(log: unknown, options: Options): unknown {
  return call(untypedPrepareSarif, log, options);
}

export function sarifFindings(prepared: unknown): IngestedFinding[] {
  return findingsOf(fieldOf(call(untypedIngestSarif, prepared, { tool: 'ruff' }), 'findings'));
}

export function readClassesReport(reportRoot: string): unknown {
  return call(untypedClasses, reportRoot);
}

export function pythonPersistence(imports: ImportsReport, options: Options): unknown {
  return call(untypedPersistence, imports, options);
}

export function pythonFeatureAnalysis(imports: ImportsReport, options: Options): Features {
  const analysis = call(untypedFeatures, imports, options);
  if (!isFeatures(analysis)) {
    throw new Error('The feature analysis is malformed');
  }
  return analysis;
}

export function cycleFindings(imports: ImportsReport, features: Features): IngestedFinding[] {
  return findingsOf(call(untypedCycles, imports, features));
}

export function outsideRootsFindings(imports: ImportsReport): IngestedFinding[] {
  return findingsOf(call(untypedOutsideRoots, imports));
}

export function pythonFolderDepthFindings(
  modules: readonly PythonModule[],
  options: Options,
): IngestedFinding[] {
  return findingsOf(call(untypedFolderDepth, modules, options));
}

export function pythonClassLimitFindings(
  classes: unknown,
  modules: readonly PythonModule[],
  limits: Options,
): IngestedFinding[] {
  return findingsOf(call(untypedClassLimits, classes, modules, limits));
}

export function readPythonCrapFindings(options: Options): IngestedFinding[] {
  return findingsOf(call(untypedCrap, options));
}

export function readManifest(text: string): Manifest {
  const manifest = parseJson(text);
  if (typeof fieldOf(manifest, 'formatter') !== 'string') {
    throw new Error('The manifest report is malformed');
  }
  return { ...fieldsOf(manifest), formatter: textOf(fieldOf(manifest, 'formatter')) };
}

export function readTypesReport(text: string): TypesReport {
  const report = parseJson(text);
  return { checker: textOf(fieldOf(report, 'checker')), output: textOf(fieldOf(report, 'output')) };
}
