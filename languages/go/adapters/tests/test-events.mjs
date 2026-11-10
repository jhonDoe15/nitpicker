import { WARNING, withoutRaceReports } from '../race/race-reports.mjs';

const OUTCOMES = { pass: 'passed', fail: 'failed', skip: 'skipped' };
const RUNNER_LINE = /^(?:=== |--- |FAIL\b|ok\b|PASS$|coverage: )/u;
const PACKAGE_SUFFIX = / \[[^\]]+\]$/u;

export function parseEventLines(text) {
  return text.split(/\r?\n/u).flatMap((line) => {
    if (!line.startsWith('{')) {
      return [];
    }
    try {
      return [JSON.parse(line)];
    } catch (error) {
      return [{ Action: 'unparsed', Output: line, Error: error.message }];
    }
  });
}

function packageOf(event) {
  return (event.Package ?? event.ImportPath ?? '').replace(PACKAGE_SUFFIX, '');
}

function failedBuilds(events) {
  return new Set(
    events.flatMap((event) => {
      if (event.Action === 'build-fail') {
        return [packageOf(event)];
      }
      return event.FailedBuild === undefined ? [] : [packageOf(event)];
    }),
  );
}

function outputsOf(events) {
  const outputs = new Map();
  for (const event of events.filter(({ Action }) => Action === 'output')) {
    const key = `${packageOf(event)}\0${event.Test ?? ''}`;
    outputs.set(key, `${outputs.get(key) ?? ''}${event.Output ?? ''}`);
  }
  return outputs;
}

function hasFailedTest(tests, packageName) {
  return tests.some((test) => test.package === packageName && test.outcome === 'failed');
}

function unfinishedOutput(events, outputs, packageName) {
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
    .map(({ Test }) => outputs.get(`${packageName}\0${Test}`) ?? '')
    .join('');
}

export function meaningfulLines(output) {
  return output
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line !== '' && !RUNNER_LINE.test(line));
}

function failureOf(event, { events, outputs }) {
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

function outputEntries(outputs) {
  return [...outputs].map(([key, output]) => {
    const [packageName, test] = key.split('\0');
    return { package: packageName, test, output };
  });
}

function hasFailingSubtest(failure, failures) {
  return (
    failure.test !== undefined &&
    meaningfulLines(failure.output).length === 0 &&
    failures.some(
      (other) =>
        other.package === failure.package && other.test?.startsWith(`${failure.test}/`) === true,
    )
  );
}

export function parseTestEvents(text) {
  const events = parseEventLines(text);
  const builds = failedBuilds(events);
  const outputs = outputsOf(events);
  const entries = outputEntries(outputs);
  const finished = events.filter(({ Action }) => Object.hasOwn(OUTCOMES, Action));
  const tests = finished
    .filter(({ Test }) => Test !== undefined)
    .map((event) => ({
      package: packageOf(event),
      name: event.Test,
      seconds: event.Elapsed ?? 0,
      outcome: OUTCOMES[event.Action],
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
