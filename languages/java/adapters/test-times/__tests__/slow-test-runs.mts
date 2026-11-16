import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll } from 'vitest';
import { readSlowTestFindings } from '../slow-tests.mts';

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
  const temporaryRoots: string[] = [];

  afterAll(() => {
    for (const root of temporaryRoots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  function directoryWith(files: Files): string {
    const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-slow-tests-'));
    temporaryRoots.push(root);
    for (const [name, text] of Object.entries(files)) {
      mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
      writeFileSync(path.join(root, name), text);
    }
    return root;
  }

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
