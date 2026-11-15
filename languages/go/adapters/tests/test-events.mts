import { WARNING, withoutRaceReports } from '../race/race-reports.mts';
import { fieldOf, messageOf, parseJson } from '../../../../shared/values/readers.mts';
import type { ParsedTestRun, TestEvent } from '../go-types.mts';

type Failure = { id: string; package: string; test: string | undefined; output: string };
type Collected = { events: readonly TestEvent[]; outputs: ReadonlyMap<string, string> };

const OUTCOMES: Readonly<Record<string, string>> = {
  pass: 'passed',
  fail: 'failed',
  skip: 'skipped',
};
const RUNNER_LINE = /^(?:=== |--- |FAIL\b|ok\b|PASS$|coverage: )/u;
const PACKAGE_SUFFIX = / \[[^\]]+\]$/u;

function optionalText(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function eventOf(value: unknown): TestEvent {
  const elapsed = fieldOf(value, 'Elapsed');
  return {
    Action: optionalText(fieldOf(value, 'Action')) ?? '',
    Package: optionalText(fieldOf(value, 'Package')),
    ImportPath: optionalText(fieldOf(value, 'ImportPath')),
    Test: optionalText(fieldOf(value, 'Test')),
    Output: optionalText(fieldOf(value, 'Output')),
    Error: optionalText(fieldOf(value, 'Error')),
    Elapsed: typeof elapsed === 'number' ? elapsed : undefined,
    FailedBuild: optionalText(fieldOf(value, 'FailedBuild')),
  };
}

export function parseEventLines(text: string): TestEvent[] {
  return text.split(/\r?\n/u).flatMap((line) => {
    if (!line.startsWith('{')) {
      return [];
    }
    try {
      return [eventOf(parseJson(line))];
    } catch (error) {
      return [{ Action: 'unparsed', Output: line, Error: messageOf(error) }];
    }
  });
}

function packageOf(event: TestEvent) {
  return (event.Package ?? event.ImportPath ?? '').replace(PACKAGE_SUFFIX, '');
}

function failedBuilds(events: readonly TestEvent[]) {
  return new Set(
    events.flatMap((event) => {
      if (event.Action === 'build-fail') {
        return [packageOf(event)];
      }
      return event.FailedBuild === undefined ? [] : [packageOf(event)];
    }),
  );
}

function outputsOf(events: readonly TestEvent[]) {
  const outputs = new Map<string, string>();
  for (const event of events.filter(({ Action }) => Action === 'output')) {
    const key = `${packageOf(event)}\0${event.Test ?? ''}`;
    outputs.set(key, `${outputs.get(key) ?? ''}${event.Output ?? ''}`);
  }
  return outputs;
}

function hasFailedTest(tests: ParsedTestRun['tests'], packageName: string) {
  return tests.some((test) => test.package === packageName && test.outcome === 'failed');
}

function unfinishedOutput(
  events: readonly TestEvent[],
  outputs: ReadonlyMap<string, string>,
  packageName: string,
) {
  const finished = new Set(
    events
      .filter((event) => Object.hasOwn(OUTCOMES, event.Action) && packageOf(event) === packageName)
      .map(({ Test }) => Test),
  );
  return events
    .filter(
      (event) =>
        event.Action === 'run' && packageOf(event) === packageName && !finished.has(event.Test),
    )
    .map(({ Test }) => outputs.get(`${packageName}\0${String(Test)}`) ?? '')
    .join('');
}

export function meaningfulLines(output: string): string[] {
  return output
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line !== '' && !RUNNER_LINE.test(line));
}

function failureOf(event: TestEvent, { events, outputs }: Collected): Failure {
  const packageName = packageOf(event);
  const own = outputs.get(`${packageName}\0${event.Test ?? ''}`) ?? '';
  const output =
    event.Test === undefined ? `${unfinishedOutput(events, outputs, packageName)}${own}` : own;
  return {
    id: event.Test === undefined ? packageName : `${packageName}.${event.Test}`,
    package: packageName,
    test: event.Test,
    output: withoutRaceReports(output),
  };
}

function outputEntries(outputs: ReadonlyMap<string, string>) {
  return [...outputs].map(([key, output]) => {
    const [packageName = '', test = ''] = key.split('\0');
    return { package: packageName, test, output };
  });
}

function hasFailingSubtest(failure: Failure, failures: readonly Failure[]) {
  return (
    failure.test !== undefined &&
    meaningfulLines(failure.output).length === 0 &&
    failures.some(
      (other) =>
        other.package === failure.package &&
        other.test?.startsWith(`${String(failure.test)}/`) === true,
    )
  );
}

export function parseTestEvents(text: string): ParsedTestRun {
  const events = parseEventLines(text);
  const builds = failedBuilds(events);
  const outputs = outputsOf(events);
  const entries = outputEntries(outputs);
  const finished = events.filter(({ Action }) => Object.hasOwn(OUTCOMES, Action));
  const tests = finished
    .filter(({ Test }) => Test !== undefined)
    .map((event) => ({
      package: packageOf(event),
      name: event.Test ?? '',
      seconds: event.Elapsed ?? 0,
      outcome: OUTCOMES[event.Action] ?? '',
    }));
  const failures = finished
    .filter(({ Action }) => Action === 'fail')
    .filter((event) => !builds.has(packageOf(event)))
    .filter((event) => event.Test !== undefined || !hasFailedTest(tests, packageOf(event)))
    .map((event) => failureOf(event, { events, outputs }));
  return {
    events: events.length,
    tests,
    failures: failures
      .filter((failure) => !hasFailingSubtest(failure, failures))
      .map(({ id, package: packageName, output }) => ({ id, package: packageName, output })),
    buildFailures: [...builds].sort(),
    outputs: entries,
    raceOutputs: entries.filter(({ output }) => output.includes(WARNING)),
    testsRan: events.some(({ Action }) => Action === 'run'),
  };
}
