import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { UNITTEST_SCRIPT } from '../execution/python-test-runner.mjs';
import { pythonUsable } from '../../metrics/python-helpers.mjs';
import { readSlowTestFindings } from './slow-tests.mjs';

const roots = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function directory(files = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-slow-tests-'));
  roots.push(root);
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), text);
  }
  return root;
}

const UNIT =
  'import time\n\n\ndef test_wait():\n    time.sleep(6)\n\n\ndef test_fast():\n    assert True\n';
const MARKED =
  'import pytest\n\n\n@pytest.mark.integration\ndef test_wait():\n    pass\n\n\nclass TestApi:\n    def test_call(self):\n        pass\n';

function junit(cases) {
  const body = cases
    .map(
      ([file, classname, name, seconds, line]) =>
        `<testcase classname="${classname}" name="${name}" file="${file}" line="${String(line)}" time="${String(seconds)}"/>`,
    )
    .join('');
  return directory({
    'pytest-junit.xml': `<testsuites><testsuite>${body}</testsuite></testsuites>`,
  });
}

describe('slow pytest tests', () => {
  it('reports a new unit test over 5 s at its definition with the way to speed it up', () => {
    const projectRoot = directory({ 'tests/test_a.py': UNIT });
    const reportRoot = junit([
      ['tests/test_a.py', 'tests.test_a', 'test_wait', 6.2, 3],
      ['tests/test_a.py', 'tests.test_a', 'test_fast', 0.1, 7],
    ]);

    expect(readSlowTestFindings({ reportRoot, projectRoot, baselineRoot: directory() })).toEqual([
      {
        tool: 'test-runtime',
        rule: 'slow-test',
        path: 'tests/test_a.py',
        identity: 'test:tests/test_a.py::::test_wait',
        location: { line: 4 },
        classification: 'enforceable',
        message:
          'test_wait took 6.2 s; a unit test may take 5 s. Remove time.sleep and other real waits, and use smaller fixtures, or move it to a tests/integration/ folder or mark it @pytest.mark.integration if it is one.',
      },
    ]);
  });
  it('gives integration tests 30 s, by folder or by marker, and takes the slowest parametrized run', () => {
    const projectRoot = directory({
      'tests/integration/test_db.py': UNIT,
      'tests/test_marked.py': MARKED,
    });
    const reportRoot = junit([
      ['tests/integration/test_db.py', 'tests.integration.test_db', 'test_wait', 29, 3],
      ['tests/test_marked.py', 'tests.test_marked', 'test_wait[1]', 12, 4],
      ['tests/test_marked.py', 'tests.test_marked', 'test_wait[2]', 31, 4],
    ]);

    const findings = readSlowTestFindings({ reportRoot, projectRoot });

    expect(findings.map(({ message }) => message)).toEqual([
      'test_wait took 31.0 s; an integration test may take 30 s. Remove time.sleep and other real waits, and use smaller fixtures.',
    ]);
  });
  it('reads a marker on the class and honours the configured limits', () => {
    const projectRoot = directory({
      'tests/test_api.py':
        'import pytest\n\n\n@pytest.mark.e2e\nclass TestApi:\n    def test_call(self):\n        pass\n',
    });
    const reportRoot = junit([['tests/test_api.py', 'tests.test_api.TestApi', 'test_call', 3, 5]]);

    expect(
      readSlowTestFindings({ reportRoot, projectRoot, limits: { integrationTestSeconds: 2 } }).map(
        ({ message }) => message.split(';')[0],
      ),
    ).toEqual(['TestApi.test_call took 3.0 s']);
  });
  it('leaves out tests the change did not add or edit, and the base snapshot', () => {
    const projectRoot = directory({ 'tests/test_a.py': UNIT });
    const baselineRoot = directory({ 'tests/test_a.py': `# moved\n${UNIT}` });
    const reportRoot = junit([['tests/test_a.py', 'tests.test_a', 'test_wait', 9, 3]]);

    expect(readSlowTestFindings({ reportRoot, projectRoot, baselineRoot })).toEqual([]);
    expect(readSlowTestFindings({ reportRoot, projectRoot, snapshot: 'base' })).toEqual([]);
    expect(
      readSlowTestFindings({
        reportRoot,
        projectRoot,
        baselineRoot: directory({ 'tests/test_a.py': UNIT.replace('6', '7') }),
      }),
    ).toHaveLength(1);
  });
  it('reads an edit to the body of a test whose signature the formatter wrapped', () => {
    const wrapped = (body) =>
      `import time\n\n\ndef test_pages(\n    first=10,\n    second=20,\n):\n${body}    assert first < second\n`;
    const projectRoot = directory({ 'tests/test_api.py': wrapped('    time.sleep(6)\n') });
    const reportRoot = junit([['tests/test_api.py', 'tests.test_api', 'test_pages', 6, 3]]);
    const baselineRoot = directory({ 'tests/test_api.py': wrapped('') });

    expect(
      readSlowTestFindings({ reportRoot, projectRoot, baselineRoot }).map(
        ({ location }) => location,
      ),
    ).toEqual([{ line: 4 }]);
  });
  it('reads an integration mark above a wrapped decorator, and a pytestmark in the class body', () => {
    const projectRoot = directory({
      'tests/test_sync.py':
        'import pytest\n\n\n@pytest.mark.integration\n@pytest.mark.parametrize(\n    "region",\n    ["eu", "us"],\n)\ndef test_sync(region):\n    pass\n',
      'tests/test_orders.py':
        'import pytest\n\n\nclass TestOrders:\n    pytestmark = [\n        pytest.mark.slow,\n        pytest.mark.integration,\n    ]\n\n    def test_create(self):\n        pass\n',
    });
    const reportRoot = junit([
      ['tests/test_sync.py', 'tests.test_sync', 'test_sync[eu]', 6, 3],
      ['tests/test_orders.py', 'tests.test_orders.TestOrders', 'test_create', 12, 9],
    ]);

    expect(readSlowTestFindings({ reportRoot, projectRoot, baselineRoot: directory() })).toEqual(
      [],
    );
  });
  it('leaves out an unchanged test whose file moved, and names no pytest mark for unittest', () => {
    const projectRoot = directory({ 'tests/unit/test_legacy.py': UNIT });
    const reportRoot = junit([
      ['tests/unit/test_legacy.py', 'tests.unit.test_legacy', 'test_wait', 7, 3],
    ]);
    const moved = { reportRoot, projectRoot, testRunner: 'unittest' };

    expect(
      readSlowTestFindings({ ...moved, baselineRoot: directory({ 'tests/test_legacy.py': UNIT }) }),
    ).toEqual([]);
    expect(
      readSlowTestFindings({
        ...moved,
        baselineRoot: directory({ 'tests/test_other.py': '' }),
      }).map(({ message }) => message.split('fixtures')[1]),
    ).toEqual([', or move it to a tests/integration/ folder if it is one.']);
  });
});

const UNITTEST_CASES = [
  'import time',
  'import unittest',
  '',
  '',
  'class ShapeTest(unittest.TestCase):',
  '    @classmethod',
  '    def setUpClass(cls):',
  '        time.sleep(0.3)',
  '',
  '    def test_fast(self):',
  '        pass',
  '',
  '    def test_slow(self):',
  '        time.sleep(0.3)',
  '',
].join('\n');

describe.skipIf(!pythonUsable())('slow unittest tests', () => {
  it('times each unittest test in its own run, without the class setup', () => {
    const projectRoot = directory({
      'tests/__init__.py': '',
      'tests/test_shape.py': UNITTEST_CASES,
    });
    const reportRoot = directory();
    const result = spawnSync(
      'python3',
      [
        UNITTEST_SCRIPT,
        path.join(reportRoot, 'pytest-junit.xml'),
        'discover',
        '-s',
        'tests',
        '-t',
        '.',
      ],
      { cwd: projectRoot, encoding: 'utf8' },
    );

    expect(result.stderr).toMatch(/Ran 2 tests/u);
    expect(
      readSlowTestFindings({
        reportRoot,
        projectRoot,
        testRunner: 'unittest',
        limits: { unitTestSeconds: 0.2 },
      }).map(({ path: file, location, message }) => [file, location, message.split(' took')[0]]),
    ).toEqual([['tests/test_shape.py', { line: 13 }, 'ShapeTest.test_slow']]);
  });
});
