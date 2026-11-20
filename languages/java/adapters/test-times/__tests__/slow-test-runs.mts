import { readSlowTestFindings } from '../slow-tests.mts';
import { temporaryProjectMaker } from '../../../__tests__/temporary-roots.mts';

export type Files = Readonly<Record<string, string>>;

type FindingsRequest = {
  sources?: Files;
  results: Readonly<Record<string, string | readonly string[]>>;
  base?: Files;
  limits?: unknown;
  snapshot?: string;
  modulePath?: string;
  testRoots?: readonly string[];
  containers?: Readonly<Record<string, readonly unknown[]>>;
};

type Findings = ReturnType<typeof readSlowTestFindings>;

function containersFile(task: string): string {
  return `test-results/${task}/nitpicker-containers.json`;
}

export function suite(className: string, cases: readonly (readonly [string, string])[]): string {
  const testCases = cases
    .map(([name, time]) => `  <testcase name="${name}" classname="${className}" time="${time}"/>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<testsuite name="${className}">\n${testCases}\n</testsuite>\n`;
}

export function slowTestRuns(defaultTestRoot: string): {
  readonly findingsFor: (request: FindingsRequest) => Findings;
  readonly linesOf: (
    options: Omit<FindingsRequest, 'sources'>,
  ) => (sources: Files) => (string | number | undefined)[][];
} {
  const directoryWith = temporaryProjectMaker('nitpicker-slow-tests-');

  function findingsFor({
    sources = {},
    results,
    base,
    limits,
    snapshot = 'head',
    modulePath,
    testRoots = [defaultTestRoot],
    containers = {},
  }: FindingsRequest): Findings {
    const reportRoot = directoryWith({
      ...Object.fromEntries(
        Object.entries(results).flatMap(([task, xml]) =>
          [xml]
            .flat()
            .map((text, index) => [`test-results/${task}/TEST-${String(index)}.xml`, text]),
        ),
      ),
      ...Object.fromEntries(
        Object.entries(containers).map(([task, list]) => [
          containersFile(task),
          JSON.stringify(list),
        ]),
      ),
    });
    const baseline = {
      snapshot,
      baselineRoot: base === undefined ? undefined : directoryWith(base),
    };
    return readSlowTestFindings({
      reportRoot,
      projectRoot: directoryWith(sources),
      testRoots,
      limits,
      baseline,
      modulePath,
    });
  }

  function linesOf(
    options: Omit<FindingsRequest, 'sources'>,
  ): (sources: Files) => (string | number | undefined)[][] {
    return (sources) =>
      findingsFor({ ...options, sources }).map(({ path: file, location }) => [
        file,
        location?.line,
      ]);
  }

  return { findingsFor, linesOf };
}
