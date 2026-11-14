import { exceptionHint as untypedExceptionHintSource } from '../../../../shared/rules/exceptions.mjs';
import { branchCoverageFindings as untypedBranchCoverageFindings } from '../../../../shared/rules/branch-coverage.mjs';
import { hashIdentity as untypedHashIdentity } from '../../../../shared/ingest/common.mjs';
import { formatAgnosticText as untypedFormatAgnosticText } from '../../../../shared/source-text/format-tokens.mjs';
import { ingestCrapRows as untypedIngestCrapRows } from '../../../../shared/ingest/lizard-crap.mjs';
import {
  buildCouplingReport as untypedBuildCouplingReport,
  evaluateCoupling as untypedEvaluateCoupling,
} from '../../../../shared/rules/coupling.mjs';
import {
  adapterMessage as untypedAdapterMessage,
  domainFinding as untypedDomainFinding,
  libraryMessage as untypedLibraryMessage,
} from '../../../../shared/rules/domain/domain-messages.mjs';
import { listed as untypedListed } from '../../../../shared/rules/features/feature-boundaries.mjs';
import { registeredFactRules as untypedRegisteredFactRules } from '../../../../shared/project-rules/fact-rules.mjs';
import { structureFindings as untypedStructureFindings } from '../../../../shared/ingest/structure-report.mjs';
import { collectFileLimitFindings as untypedCollectFileLimitFindings } from '../../../../shared/rules/file-limits.mjs';
import { classLimitFindings as untypedClassLimitFindings } from '../../../../shared/rules/size/class-limits.mjs';
import { folderDepthFindings as untypedFolderDepthFindings } from '../../../../shared/rules/size/folder-depth.mjs';
import {
  classifyTestRuntime as untypedClassifyTestRuntime,
  testRuntimeReport as untypedTestRuntimeReport,
} from '../../../../shared/rules/test-runtime/classify.mjs';
import { evaluateTestRuntime as untypedEvaluateTestRuntime } from '../../../../shared/rules/test-runtime/evaluate.mjs';
import { hash as untypedHash } from '../../../../shared/rules/finding-helpers.mjs';
import {
  slowTestBudget as untypedSlowTestBudget,
  slowTestFindings as untypedSlowTestFindings,
} from '../../../../shared/rules/slow-tests/slow-test-finding.mjs';
import { designFacts as untypedDesignFacts } from '../../../../shared/rules/design/test-support/design-facts.mjs';
import { fieldOf, listOf, textOf } from '../../../../shared/values/readers.mts';
import type { DesignCallable, DesignType, FindingRow, GoFunction } from '../go-types.mts';

type Fields = { readonly [field: string]: unknown };
type Exceptions = readonly unknown[];

const branchCoverageFindings: (
  branches: readonly object[],
  options: { tool: string; identify: (key: string, occurrence: number) => string },
) => FindingRow[] = untypedBranchCoverageFindings;
const hashIdentity: (prefix: string, parts: readonly string[]) => string = untypedHashIdentity;
const formatAgnosticText: (text: string, filePath: string) => string = untypedFormatAgnosticText;
const ingestCrapRows: (
  rows: readonly { file: string; fn: GoFunction }[] & readonly object[],
  options: { limit: number | undefined; sourceText: (fn: never) => string },
  resolve: (row: never) => object,
) => { findings: FindingRow[] } = untypedIngestCrapRows;
const buildCouplingReport: (input: {
  modules: readonly string[];
  edges: readonly { source: string; target: string }[];
  packageOf: (unit: string) => string;
  fileOf: (unit: string) => string | undefined;
  roleOf: undefined;
}) => { stabilityDirection: readonly { source: string; target: string }[] } =
  untypedBuildCouplingReport;
const evaluateCoupling: (report: object, analyzerName: string) => FindingRow[] =
  untypedEvaluateCoupling;
const domainFinding: (
  entry: { rule: string; file: string; identity: string },
  message: string,
) => FindingRow = untypedDomainFinding;
const adapterMessage: (values: { owner: string; used: string; packageName: string }) => string =
  untypedAdapterMessage;
const libraryMessage: (
  rule: string,
  values: { owner: string; used: string; first: string },
) => string = untypedLibraryMessage;
const listed: (items: readonly string[]) => string = untypedListed;
const registeredFactRules: (language: string) => string[] = untypedRegisteredFactRules;
const collectFileLimitFindings: (
  projectRoot: string,
  entries: readonly object[],
  options: { analyzerName: string; thresholds: object; exceptions: Exceptions },
) => FindingRow[] = untypedCollectFileLimitFindings;
const classLimitFindings: (
  classes: readonly object[],
  options: {
    analyzerName: string;
    messageKeys: Fields;
    thresholds: object;
    exceptions: Exceptions;
  },
) => FindingRow[] = untypedClassLimitFindings;
const folderDepthFindings: (files: readonly object[], options: Fields) => FindingRow[] =
  untypedFolderDepthFindings;
const classifyTestRuntime: (
  file: string,
  options: {
    edges: ReadonlyMap<string, readonly object[]>;
    isProduction: (node: string) => boolean;
  },
) => object = untypedClassifyTestRuntime;
const slowTestBudget: (limits: unknown) => {
  unitTestSeconds: number;
  integrationTestSeconds: number;
} = untypedSlowTestBudget;
const evaluateTestRuntime: (report: object, analyzer: string) => FindingRow[] =
  untypedEvaluateTestRuntime;
const hash: (text: string) => string = untypedHash;
export type RuntimeReport = {
  readonly summary: { readonly discoveredTests: number };
  readonly findings: readonly { readonly test: string }[];
  readonly [field: string]: unknown;
};

function isRow(value: unknown): value is FindingRow {
  return typeof value === 'object' && value !== null;
}

function rowsOf(value: unknown): FindingRow[] {
  return listOf(value).filter(isRow);
}

function isRuntimeReport(value: unknown): value is RuntimeReport {
  const findings = fieldOf(value, 'findings');
  return (
    typeof fieldOf(fieldOf(value, 'summary'), 'discoveredTests') === 'number' &&
    listOf(findings).every((finding) => typeof fieldOf(finding, 'test') === 'string')
  );
}

function structureFindings(
  entries: readonly object[],
  projectRoot: string,
  options: { hints: Fields; numberedAmongSameSource: boolean },
): FindingRow[] {
  return rowsOf(
    Reflect.apply(untypedStructureFindings, undefined, [entries, projectRoot, options]),
  );
}

function testRuntimeReport(input: {
  tests: readonly string[];
  excluded: readonly string[];
  classify: (file: string) => object;
}): RuntimeReport {
  const report: unknown = Reflect.apply(untypedTestRuntimeReport, undefined, [input]);
  if (!isRuntimeReport(report)) {
    throw new TypeError('The test runtime report has an unexpected shape');
  }
  return report;
}

function slowTestFindings(input: Fields): FindingRow[] {
  return rowsOf(Reflect.apply(untypedSlowTestFindings, undefined, [input]));
}

function designFacts(input: {
  types: readonly DesignType[];
  callables: readonly DesignCallable[];
}): { modules: readonly { file: string }[] } {
  const facts: unknown = Reflect.apply(untypedDesignFacts, undefined, [input]);
  return {
    modules: listOf(fieldOf(facts, 'modules')).map((module) => ({
      file: textOf(fieldOf(module, 'file')),
    })),
  };
}

export {
  adapterMessage,
  branchCoverageFindings,
  buildCouplingReport,
  classLimitFindings,
  classifyTestRuntime,
  collectFileLimitFindings,
  designFacts,
  domainFinding,
  evaluateCoupling,
  evaluateTestRuntime,
  folderDepthFindings,
  formatAgnosticText,
  hash,
  hashIdentity,
  ingestCrapRows,
  libraryMessage,
  listed,
  registeredFactRules,
  slowTestBudget,
  slowTestFindings,
  structureFindings,
  testRuntimeReport,
};

export const exceptionHint: (rule: string, path: string) => string = untypedExceptionHintSource;
