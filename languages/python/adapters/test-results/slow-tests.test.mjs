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

function run(projectRoot, file, test, seconds, markers = []) {
  return { nodeid: `${file}::${test}`, file: path.join(projectRoot, file), test, seconds, markers };
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
  it('reports a unit test over 5 s at its def line', () => {
    const findings = findingsFor({
      runs: (root) => [
        run(root, ORDER_TEST, 'test_total', 5.4),
        run(root, ORDER_TEST, 'TestCart::test_empty', 0.1),
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
        run(root, ORDER_TEST, 'test_total', 20, ['integration']),
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

  it('reports only tests the change adds or edits', () => {
    const base = {
      [ORDER_TEST]: `import time


def test_total():
    assert 1 + 2 == 3


class TestCart:
    def test_empty(self):
        assert not []
`,
    };
    const findings = findingsFor({
      base,
      runs: (root) => [
        run(root, ORDER_TEST, 'test_total', 9),
        run(root, ORDER_TEST, 'TestCart::test_empty', 9),
      ],
    });

    expect(findings.map(({ identity }) => identity)).toEqual([
      `test:${ORDER_TEST}::TestCart::test_empty`,
    ]);
  });

  it('counts a test of a new file, and a test it cannot find when its file changed', () => {
    const findings = findingsFor({
      base: { 'tests/test_other.py': '' },
      runs: (root) => [
        run(root, ORDER_TEST, 'test_total', 9),
        run(root, ORDER_TEST, 'test_generated', 9),
      ],
    });

    expect(findings.map(({ identity, location }) => [identity, location])).toEqual([
      [`test:${ORDER_TEST}::test_total`, { line: 4 }],
      [`test:${ORDER_TEST}::test_generated`, undefined],
    ]);
  });

  it('reports nothing on the base snapshot', () => {
    expect(
      findingsFor({
        runs: (root) => [run(root, ORDER_TEST, 'test_total', 9)],
        policy: { snapshot: 'base' },
      }),
    ).toEqual([]);
  });

  it('reads a missing report as empty and paths outside the project as the project', () => {
    expect(readPytestReport(directoryWith({}), 'pytest-report.json')).toEqual({
      tests: [],
      entries: [],
    });
    expect(projectRelative('/work/app', '/work/app/tests/test_a.py')).toBe('tests/test_a.py');
    expect(projectRelative('/work/app', '/elsewhere/test_a.py')).toBe('.');
    expect(projectRelative('/work/app', '')).toBe('.');
  });
});
