import { integrationTestFiles } from '../../../../messages/isolation/unit-tests.mts';
import { compareText as untypedCompareText } from '../../../../../../shared/paths/path-order.mjs';
import { lineOf } from '../../scan/kotlin-source.mts';
import { kotlinFiles } from '../../rules/kotlin-suppressions.mts';
import type { FindingFactory, ReviewFinding } from '../typed/review-finding-types.mts';
import { coroutineReports } from './coroutines/coroutine-reports.mts';
import { ESCAPING_RULE } from './coroutines/escapes/escaping-launches.mts';
import { discoverSuites, scanTestFile } from './discovery/test-units.mts';
import { GLOBAL_STATE_RULE, globalStateReports } from './global-state/global-state.mts';
import { CONTROL_FLOW_RULE } from './honesty/flow/assertion-flow.mts';
import { DROPPED_RULE } from './honesty/dropped/dropped-callbacks.mts';
import { MESSAGE_RULE } from './honesty/dropped/message-after-assertion.mts';
import { FOCUSED_RULE } from './honesty/focused-tests.mts';
import { honestyReports } from './honesty/honesty-reports.mts';
import { RETRY_RULE } from './honesty/retries/retry-tests.mts';
import { DISABLED_RULE } from './honesty/skipped-tests.mts';
import { ISOLATION_RULES, isolationReports } from './isolation/isolation.mts';
import { FLOAT_EQUALITY_RULE, floatEqualityReports } from './floats/float-equality.mts';
import { WEAK_RULE } from './honesty/weak/weak-reports.mts';
import { projectFlags } from './project-flags.mts';
import {
  PER_TEST_START_MESSAGE,
  PER_TEST_START_RULE,
  perTestStarts,
} from './setup/per-test-starts.mts';
import { SHARED_STATE_RULE, sharedStateReports } from './shared-state/shared-state.mts';
import type { TestScanned } from './typed/discovery-types.mts';
import type { ProjectFlags, Report, ScannedFile } from './typed/report-types.mts';
import { readText } from './typed/read-text.mts';

export const HONESTY_RULES = [
  DISABLED_RULE,
  FOCUSED_RULE,
  RETRY_RULE,
  PER_TEST_START_RULE,
  CONTROL_FLOW_RULE,
  ESCAPING_RULE,
  FLOAT_EQUALITY_RULE,
  WEAK_RULE,
  DROPPED_RULE,
  MESSAGE_RULE,
  GLOBAL_STATE_RULE,
  ...ISOLATION_RULES,
  SHARED_STATE_RULE,
];

const CONTEXT_MARKERS = new RegExp(
  [
    'setMain|coroutineTestScope|testCoroutineDispatcher|typealias|ProjectConfig',
    String.raw`fun\s+delay\b|annotation\s+class|const\s+val`,
  ].join('|'),
  'u',
);

const compareText: (left: string, right: string) => number = untypedCompareText;
const sourceFiles: (projectRoot: string, root: string) => string[] = kotlinFiles;

function filesUnder(projectRoot: string, roots: readonly string[]): string[] {
  return [...new Set(roots.flatMap((root) => sourceFiles(projectRoot, root)))].toSorted(
    compareText,
  );
}

type ScanOptions = { keep?: (text: string) => boolean; assertionNames?: string[] };

function scannedFiles(
  projectRoot: string,
  files: string[],
  { keep, assertionNames = [] }: ScanOptions = {},
): ScannedFile[] {
  return files.flatMap((file) => {
    const text = readText(projectRoot, file) ?? '';
    const scanned =
      keep === undefined || keep(text) ? scanTestFile(text, assertionNames) : undefined;
    return scanned === undefined ? [] : [{ file, scanned }];
  });
}

export function fileReports(
  scanned: TestScanned,
  project: ProjectFlags,
  options: { network: boolean } = { network: true },
): Report[] {
  const suites = discoverSuites(scanned);
  return [
    ...honestyReports(scanned, suites, project),
    ...coroutineReports(scanned, suites, project),
    ...floatEqualityReports(scanned, suites),
    ...globalStateReports(scanned, suites),
    ...isolationReports(scanned, options),
    ...sharedStateReports(scanned, suites, project),
    ...perTestStarts(scanned, suites).map((entry) => ({
      ...entry,
      rule: PER_TEST_START_RULE,
      message: PER_TEST_START_MESSAGE,
    })),
  ].toSorted((left, right) => left.offset - right.offset);
}

type HonestyOptions = {
  projectRoot: string;
  testRoots?: string[];
  contextRoots?: string[];
  assertionNames?: string[];
  finding: FindingFactory;
};

export function testHonestyFindings({
  projectRoot,
  testRoots = [],
  contextRoots = [],
  assertionNames = [],
  finding,
}: HonestyOptions): ReviewFinding[] {
  const testFiles = filesUnder(projectRoot, testRoots);
  const own = new Set(testFiles);
  const files = scannedFiles(projectRoot, testFiles, { assertionNames });
  const others = filesUnder(projectRoot, contextRoots).filter((file) => !own.has(file));
  const context = scannedFiles(projectRoot, others, { keep: (text) => CONTEXT_MARKERS.test(text) });
  const project = projectFlags([...files, ...context]);
  const isIntegration = integrationTestFiles(projectRoot, testRoots);
  return files.flatMap(({ file, scanned }) =>
    fileReports(scanned, project, { network: !isIntegration(file) }).map((report) =>
      finding({
        rule: report.rule,
        file,
        line: lineOf(scanned, report.offset),
        symbol: report.symbol,
        key: report.key,
        message: report.message,
      }),
    ),
  );
}
