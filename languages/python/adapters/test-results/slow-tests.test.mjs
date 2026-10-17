import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { projectRelative, readPytestReport, slowTestFindings } from './slow-tests.mjs';

const ORDER_TEST = 'tests/test_order.py';
const EXCEPTION = 'To allow it for some paths, add a "python.exceptions" entry for slow-test';
const temporaryRoots = [];

const ORDER_SOURCE = `import time


def test_total():
    assert 1 + 2 == 3


class TestCart:
    def test_empty(self):
        assert [] == []
`;

afterAll(() => {
  for (const root of temporaryRoots) {
    rmSync(root, { recursive: true, force: true });
  }
});

function directoryWith(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-python-slow-tests-'));
  temporaryRoots.push(root);
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), text);
  }
  return root;
}

function run(projectRoot, file, test, seconds, { markers = [], source } = {}) {
  const found = { nodeid: `${file}::${test}`, file: path.join(projectRoot, file), test, seconds };
  return { ...found, markers, ...(source === undefined ? {} : { source }) };
}

function findingsFor({ sources = { [ORDER_TEST]: ORDER_SOURCE }, runs, base, policy = {} }) {
  const projectRoot = directoryWith(sources);
  const baselineRoot = base === undefined ? undefined : directoryWith(base);
  return slowTestFindings(
    { tests: runs(projectRoot), entries: [] },
    { projectRoot, policy: { snapshot: 'head', baselineRoot, ...policy } },
  );
}

describe('Python slow tests', () => {
  it('reports a unit test over 5 s at the def line the plugin found', () => {
    const findings = findingsFor({
      runs: (root) => [
        run(root, ORDER_TEST, 'test_total', 5.4, { source: { line: 4 } }),
        run(root, ORDER_TEST, 'TestCart::test_empty', 0.1, { source: { line: 9 } }),
      ],
    });

    expect(findings).toEqual([
      {
        tool: 'test-runtime',
        rule: 'slow-test',
        path: ORDER_TEST,
        identity: `test:${ORDER_TEST}::test_total`,
        location: { line: 4 },
        message: `${ORDER_TEST}::test_total took 5.4 s; a unit test may take 5 s. Remove \`time.sleep\` and other fixed waits, or give a costly fixture a wider scope (\`scope="module"\` or \`"session"\`), or mark it \`@pytest.mark.integration\` if it is one. ${EXCEPTION} in nitpicker.config.json.`,
        classification: 'enforceable',
      },
    ]);
  });

  it('gives integration tests 30 s, by folder, file name or marker', () => {
    const sources = {
      'tests/integration/test_api.py': 'def test_call():\n    pass\n',
      'tests/test_db_integration.py': 'def test_query():\n    pass\n',
      [ORDER_TEST]: ORDER_SOURCE,
    };
    const findings = findingsFor({
      sources,
      runs: (root) => [
        run(root, 'tests/integration/test_api.py', 'test_call', 29),
        run(root, 'tests/test_db_integration.py', 'test_query', 31),
        run(root, ORDER_TEST, 'test_total', 20, { markers: ['integration'] }),
      ],
    });

    expect(findings.map(({ path: file, message }) => [file, message.split('. ')[0]])).toEqual([
      [
        'tests/test_db_integration.py',
        'tests/test_db_integration.py::test_query took 31.0 s; an integration test may take 30 s',
      ],
    ]);
    expect(findings[0].message).not.toContain('pytest.mark.integration');
  });

  it('keeps the slowest run of a parametrized test and honours configured limits', () => {
    const findings = findingsFor({
      runs: (root) => [
        run(root, ORDER_TEST, 'test_total[1]', 2.5),
        run(root, ORDER_TEST, 'test_total[2]', 3.5),
        run(root, ORDER_TEST, 'TestCart::test_empty', 2.5),
      ],
      policy: { testSeconds: { unitTestSeconds: 3 } },
    });

    expect(findings.map(({ identity, message }) => [identity, message.split(';')[0]])).toEqual([
      [`test:${ORDER_TEST}::test_total`, `${ORDER_TEST}::test_total took 3.5 s`],
    ]);
  });

  it('reports only tests the plugin found changed against the base', () => {
    const findings = findingsFor({
      base: { [ORDER_TEST]: ORDER_SOURCE },
      runs: (root) => [
        run(root, ORDER_TEST, 'test_total', 9, { source: { line: 4, changed: false } }),
        run(root, ORDER_TEST, 'TestCart::test_empty', 9, { source: { line: 9, changed: true } }),
      ],
    });

    expect(findings.map(({ identity }) => identity)).toEqual([
      `test:${ORDER_TEST}::TestCart::test_empty`,
    ]);
  });

  it('compares the whole file when the plugin found no function for the test', () => {
    const changed = findingsFor({
      base: { [ORDER_TEST]: `${ORDER_SOURCE}\n# edited\n` },
      runs: (root) => [run(root, ORDER_TEST, 'test_generated', 9)],
    });
    const unchanged = findingsFor({
      base: { [ORDER_TEST]: ORDER_SOURCE },
      runs: (root) => [run(root, ORDER_TEST, 'test_generated', 9)],
    });
    const added = findingsFor({
      base: { 'tests/test_other.py': '' },
      runs: (root) => [run(root, ORDER_TEST, 'test_generated', 9)],
    });

    expect(
      [changed, unchanged, added].map((found) => found.map(({ location }) => location)),
    ).toEqual([[undefined], [], [undefined]]);
  });

  it('reports nothing on the base snapshot', () => {
    expect(
      findingsFor({
        runs: (root) => [run(root, ORDER_TEST, 'test_total', 9)],
        policy: { snapshot: 'base' },
      }),
    ).toEqual([]);
  });

  it('reads a missing report as empty, and a tool error when pytest ran tests', () => {
    const empty = { tests: [], entries: [] };
    const root = directoryWith({});

    expect(readPytestReport(root, { testRunner: 'unittest', testsRan: true })).toEqual({
      report: empty,
      findings: [],
    });
    expect(readPytestReport(root, { testRunner: 'pytest', testsRan: false }).findings).toEqual([]);
    expect(readPytestReport(root, { testRunner: 'pytest', testsRan: true })).toEqual({
      report: empty,
      findings: [
        {
          tool: 'test-runtime',
          rule: 'pytest-report-missing',
          path: '.',
          identity: 'pytest-report-missing',
          message:
            "Slow tests and test console output were not checked: the pytest run left no pytest-report.json. A test that ends the process (os._exit) or a plugin that stops pytest early keeps nitpicker's report plugin from writing it.",
          classification: 'tool-error',
        },
      ],
    });
  });

  it('reads paths outside the project as the project', () => {
    expect(projectRelative('/work/app', '/work/app/tests/test_a.py')).toBe('tests/test_a.py');
    expect(projectRelative('/work/app', '/elsewhere/test_a.py')).toBe('.');
    expect(projectRelative('/work/app', '')).toBe('.');
  });
});
