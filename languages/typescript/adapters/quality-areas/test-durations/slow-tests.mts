import { readFileSync } from 'node:fs';
import path from 'node:path';
import type TypeScript from 'typescript';
import type { Finding } from '../../static-checks/shared.mts';
import { RULE_IDS, TEST_TIME_DEFAULTS } from '../../../../../shared/policy.mjs';
import { exceptionHint as untypedExceptionHint } from '../../../../../shared/rules/exceptions.mjs';
import { exceptionMatcher } from '../typed/policy.mts';
import { parseChangedLines, pathInside, typescriptApi } from '../typed/mutation.mts';
import { diffAgainstBase } from '../runners/mutation-scope.mts';

const exceptionHint: (rule: string, path: string) => string = untypedExceptionHint;

const INTEGRATION_FOLDERS = ['integration', 'e2e'];
const MILLISECONDS = 1000;

type LineRange = readonly [number, number];

type TestLocation = { readonly line: number; readonly column: number };

type AssertionResult = {
  readonly duration?: number;
  readonly fullName: string;
  readonly location?: TestLocation;
};

type TestResult = { readonly name: string; readonly assertionResults?: readonly AssertionResult[] };

type Limits = { readonly unitTestSeconds: number; readonly integrationTestSeconds: number };

export type SlowTestContext = {
  readonly projectRoot: string;
  readonly analyzerName: string;
  readonly testRoots: readonly string[];
  readonly thresholds?: Partial<Limits>;
  readonly exceptions?: unknown[];
  readonly changedLines: ReadonlyMap<string, readonly LineRange[]> | undefined;
};

type FileContext = SlowTestContext & { readonly limits: Limits };

type TimedTest = AssertionResult & { readonly duration: number; readonly location: TestLocation };

export function changedTestLines(options: {
  readonly baselineRoot: string | undefined;
  readonly projectRoot: string;
}): Map<string, LineRange[]> | undefined {
  if (options.baselineRoot === undefined) {
    return undefined;
  }
  const changed = parseChangedLines(diffAgainstBase(options, '--unified=0'));
  return new Map([...changed.values()].map((file) => [file.path, file.ranges]));
}

function isIntegrationTest(file: string, testRoots: readonly string[]): boolean {
  return testRoots.some((root) => {
    if (!file.startsWith(`${root}/`)) {
      return false;
    }
    const [folder] = file.slice(root.length + 1).split('/');
    return [path.posix.basename(root), folder ?? ''].some((name) =>
      INTEGRATION_FOLDERS.includes(name),
    );
  });
}

function testCallSpans(projectRoot: string, file: string): Map<string, number> {
  const ts = typescriptApi();
  const full = pathInside(projectRoot, file);
  if (full === undefined) {
    return new Map();
  }
  const text = readFileSync(full, 'utf8');
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const nodes: TypeScript.Node[] = [source];
  for (const node of nodes) {
    nodes.push(...node.getChildren(source));
  }
  return new Map(
    nodes.filter(ts.isCallExpression).map((call) => {
      const start = source.getLineAndCharacterOfPosition(call.getStart(source));
      const key = `${String(start.line + 1)}:${String(start.character + 1)}`;
      return [key, source.getLineAndCharacterOfPosition(call.end).line + 1];
    }),
  );
}

function isTouched(
  {
    ranges,
    spans,
  }: {
    readonly ranges: readonly LineRange[] | undefined;
    readonly spans: ReadonlyMap<string, number>;
  },
  location: TestLocation,
): boolean {
  if (ranges === undefined) {
    return true;
  }
  const last = spans.get(`${String(location.line)}:${String(location.column)}`) ?? location.line;
  return ranges.some(([first, end]) => first <= last && end >= location.line);
}

function slowTestMessage({
  file,
  seconds,
  budget,
  integration,
}: {
  readonly file: string;
  readonly seconds: number;
  readonly budget: number;
  readonly integration: boolean;
}): { readonly message: string; readonly allowedForm: string } {
  const kind = integration ? 'an integration or e2e test' : 'a unit test';
  const move = integration
    ? ''
    : ' If it really is an integration test, move it to an `integration/` or `e2e/` folder of a test root.';
  const allowedForm = `Replace real waits with fake timers (\`vi.useFakeTimers()\`) and use smaller fixtures.${move}`;
  return {
    message: `This test took ${seconds.toFixed(1)} s; the budget for ${kind} is ${String(budget)} s. ${allowedForm} ${exceptionHint(RULE_IDS.slowTest, file)}`,
    allowedForm,
  };
}

function isTimed(test: AssertionResult, budget: number): test is TimedTest {
  return (
    typeof test.duration === 'number' &&
    test.duration > budget * MILLISECONDS &&
    test.location !== undefined
  );
}

function fileFindings(context: FileContext, testResult: TestResult): Finding[] {
  const file = path.relative(context.projectRoot, testResult.name).replaceAll('\\', '/');
  const integration = isIntegrationTest(file, context.testRoots);
  const budget = integration
    ? context.limits.integrationTestSeconds
    : context.limits.unitTestSeconds;
  const slow = (testResult.assertionResults ?? []).filter((test) => isTimed(test, budget));
  if (slow.length === 0) {
    return [];
  }
  const touched = {
    ranges: context.changedLines?.get(file),
    spans: testCallSpans(context.projectRoot, file),
  };
  if (context.changedLines !== undefined && touched.ranges === undefined) {
    return [];
  }
  return slow
    .filter((test) => isTouched(touched, test.location))
    .map((test) => ({
      tool: context.analyzerName,
      rule: RULE_IDS.slowTest,
      path: file,
      identity: `slow-test|${file}|${test.fullName}`,
      ...slowTestMessage({
        file,
        seconds: test.duration / MILLISECONDS,
        budget,
        integration,
      }),
      classification: 'enforceable',
      location: { line: test.location.line },
    }));
}

export function slowTestFindings(
  report: { readonly testResults?: readonly TestResult[] },
  context: SlowTestContext,
): Finding[] {
  const limits = { ...TEST_TIME_DEFAULTS, ...context.thresholds };
  const isExcepted = exceptionMatcher(context.exceptions ?? []);
  return (report.testResults ?? [])
    .flatMap((testResult) => fileFindings({ ...context, limits }, testResult))
    .filter(({ rule, path: file }) => !isExcepted(rule, file));
}
