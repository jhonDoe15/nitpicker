const OUTCOMES = { pass: 'passed', fail: 'failed', skip: 'skipped' };
const PACKAGE_SUFFIX = / \[[^\]]+\]$/u;

function parseLines(text) {
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

export function parseTestEvents(text) {
  const events = parseLines(text);
  const builds = failedBuilds(events);
  const outputs = outputsOf(events);
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
    .map((event) => ({
      id: event.Test === undefined ? packageOf(event) : `${packageOf(event)}.${event.Test}`,
      package: packageOf(event),
      output: outputs.get(`${packageOf(event)}\0${event.Test ?? ''}`) ?? '',
    }));
  return {
    events: events.length,
    tests,
    failures: failures.filter(({ id }) => !failures.some((other) => other.id.startsWith(`${id}/`))),
    buildFailures: [...builds].sort(),
    testsRan: events.some(({ Action }) => Action === 'run'),
  };
}
