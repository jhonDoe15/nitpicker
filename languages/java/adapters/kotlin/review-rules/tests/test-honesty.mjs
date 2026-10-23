import { readInside } from '../../../../../../shared/conventions/read-inside.mjs';
import { lineOf } from '../../scan/kotlin-source.mjs';
import { kotlinFiles } from '../../rules/kotlin-suppressions.mjs';
import { coroutineReports } from './coroutines/coroutine-reports.mjs';
import { ESCAPING_RULE } from './coroutines/escapes/escaping-launches.mjs';
import { discoverSuites, scanTestFile } from './discovery/test-units.mjs';
import { CONTROL_FLOW_RULE } from './honesty/flow/assertion-flow.mjs';
import { FOCUSED_RULE } from './honesty/focused-tests.mjs';
import { honestyReports } from './honesty/honesty-reports.mjs';
import { DISABLED_RULE } from './honesty/skipped-tests.mjs';
import { projectFlags } from './project-flags.mjs';

export const HONESTY_RULES = [DISABLED_RULE, FOCUSED_RULE, CONTROL_FLOW_RULE, ESCAPING_RULE];

const CONTEXT_MARKERS = new RegExp(
  [
    'setMain|coroutineTestScope|testCoroutineDispatcher|typealias|ProjectConfig',
    String.raw`fun\s+delay\b|annotation\s+class|const\s+val`,
  ].join('|'),
  'u',
);

function filesUnder(projectRoot, roots) {
  return [...new Set(roots.flatMap((root) => kotlinFiles(projectRoot, root)))].toSorted();
}

function scannedFiles(projectRoot, files, keep = () => true) {
  return files.flatMap((file) => {
    const text = readInside(projectRoot, file, 'utf8') ?? '';
    const scanned = keep(text) ? scanTestFile(text) : undefined;
    return scanned === undefined ? [] : [{ file, scanned }];
  });
}

export function fileReports(scanned, project) {
  const suites = discoverSuites(scanned);
  return [
    ...honestyReports(scanned, suites, project),
    ...coroutineReports(scanned, suites, project),
  ].toSorted((left, right) => left.offset - right.offset);
}

export function testHonestyFindings({ projectRoot, testRoots = [], contextRoots = [], finding }) {
  const testFiles = filesUnder(projectRoot, testRoots);
  const own = new Set(testFiles);
  const files = scannedFiles(projectRoot, testFiles);
  const others = filesUnder(projectRoot, contextRoots).filter((file) => !own.has(file));
  const context = scannedFiles(projectRoot, others, (text) => CONTEXT_MARKERS.test(text));
  const project = projectFlags([...files, ...context]);
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
