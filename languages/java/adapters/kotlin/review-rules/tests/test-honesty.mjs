import { readInside } from '../../../../../../shared/conventions/read-inside.mjs';
import { lineOf } from '../../scan/kotlin-source.mjs';
import { kotlinFiles } from '../../rules/kotlin-suppressions.mjs';
import { coroutineReports } from './coroutines/coroutine-reports.mjs';
import { functionsOf } from './discovery/declarations.mjs';
import { discoverSuites, scanTestFile } from './discovery/test-units.mjs';
import { honestyReports } from './honesty/honesty-reports.mjs';
import { CONTROL_FLOW_RULE } from './honesty/assertion-flow.mjs';
import { DISABLED_RULE } from './honesty/skipped-tests.mjs';
import { FOCUSED_RULE } from './honesty/focused-tests.mjs';
import { ESCAPING_RULE } from './coroutines/escaping-launches.mjs';

export const HONESTY_RULES = [DISABLED_RULE, FOCUSED_RULE, CONTROL_FLOW_RULE, ESCAPING_RULE];

const MAIN_REPLACEMENT = /\bsetMain\s*\(|\bMainDispatcherRule\b|\bTestMainDispatcher\b/u;
const COROUTINE_TEST_SCOPE = /\bcoroutineTestScope\b|\btestCoroutineDispatcher\b/u;

function sourceFiles(projectRoot, testRoots) {
  const files = [
    ...new Set(testRoots.flatMap((root) => kotlinFiles(projectRoot, root))),
  ].toSorted();
  return files.flatMap((file) => {
    const scanned = scanTestFile(readInside(projectRoot, file, 'utf8') ?? '');
    return scanned === undefined ? [] : [{ file, scanned }];
  });
}

export function projectFlags(files) {
  return {
    mainReplaced: files.some(({ scanned }) => MAIN_REPLACEMENT.test(scanned.code)),
    coroutineTestScope: files.some(({ scanned }) => COROUTINE_TEST_SCOPE.test(scanned.code)),
    functionNames: new Set(
      files.flatMap(({ scanned }) => functionsOf(scanned).map(({ name }) => name)),
    ),
  };
}

export function fileReports(scanned, project) {
  const suites = discoverSuites(scanned);
  return [
    ...honestyReports(scanned, suites),
    ...coroutineReports(scanned, suites, project),
  ].toSorted((left, right) => left.offset - right.offset);
}

export function testHonestyFindings({ projectRoot, testRoots = [], finding }) {
  const files = sourceFiles(projectRoot, testRoots);
  const project = projectFlags(files);
  return files.flatMap(({ file, scanned }) =>
    fileReports(scanned, project).map((report) =>
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
