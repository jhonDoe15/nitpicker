import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { PYTEST_SCRIPT, UNITTEST_SCRIPT } from '../execution/python-test-runner.mjs';
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
          'test_wait took 6.2 s; a unit test may take 5 s. Remove time.sleep and other waits ' +
          '(patch the clock) and fake network, database and disk access, or move it to an ' +
          'integration test (an integration or e2e folder, or an integration or e2e marker ' +
          'registered in the pytest config) if it is one. If this is intended, add ' +
          '{"rule":"slow-test","paths":["tests/test_a.py"],"reason":"..."} ' +
          'to "exceptions" in nitpicker.config.json.',
        allowedForm:
          'Remove time.sleep and other waits (patch the clock) and fake network, database and disk ' +
          'access, or move it to an integration test (an integration or e2e folder, or an ' +
          'integration or e2e marker registered in the pytest config) if it is one.',
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
      'test_wait took 31.0 s; an integration test may take 30 s. Remove time.sleep and other ' +
        'waits (patch the clock) and fake network, database and disk access. If this is ' +
        'intended, add {"rule":"slow-test","paths":["tests/test_marked.py"],"reason":"..."} ' +
        'to "exceptions" in nitpicker.config.json.',
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
        'import pytest\n\n\n@pytest.mark.integration\n@pytest.mark.parametrize(\n    "region",  # (\n    ["eu)", \'u"s\', """\n)"""],\n)\ndef test_sync(region):\n    pass\n',
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
      }).map(({ message }) => message.split(' access')[1].split('. If this')[0]),
    ).toEqual([', or move it to an integration test (an integration or e2e folder) if it is one']);
  });
});

const ROUNDTRIP =
  'def test_roundtrip(codec):\n    assert codec.decompress(codec.compress(b"x")) == b"x"\n';
const EXPORTS = (classes) =>
  classes
    .map(
      (name) =>
        `class ${name}:\n    def test_exports_all_rows(self, exporter):\n        assert exporter.rows() == 3\n`,
    )
    .join('\n\n');

describe('tests the change copied or moved', () => {
  it('counts a copy of a test that still exists in the base, in another file or another class', () => {
    const baselineRoot = directory({
      'tests/test_gzip_codec.py': ROUNDTRIP,
      'tests/test_exports.py': EXPORTS(['TestCsvExport']),
    });
    const projectRoot = directory({
      'tests/test_gzip_codec.py': ROUNDTRIP,
      'tests/test_slow_codec.py': ROUNDTRIP,
      'tests/test_exports.py': EXPORTS(['TestCsvExport', 'TestPdfExport']),
    });
    const reportRoot = junit([
      ['tests/test_gzip_codec.py', 'tests.test_gzip_codec', 'test_roundtrip', 7, 0],
      ['tests/test_slow_codec.py', 'tests.test_slow_codec', 'test_roundtrip', 7, 0],
      ['tests/test_exports.py', 'tests.test_exports.TestCsvExport', 'test_exports_all_rows', 7, 1],
      ['tests/test_exports.py', 'tests.test_exports.TestPdfExport', 'test_exports_all_rows', 7, 6],
    ]);

    expect(
      readSlowTestFindings({ reportRoot, projectRoot, baselineRoot }).map(
        ({ path: file, message }) => [file, message.split(' took')[0]],
      ),
    ).toEqual([
      ['tests/test_slow_codec.py', 'test_roundtrip'],
      ['tests/test_exports.py', 'TestPdfExport.test_exports_all_rows'],
    ]);
  });
  it('leaves out a test moved with its class from a file the change removed', () => {
    const baselineRoot = directory({ 'tests/test_exports.py': EXPORTS(['TestCsvExport']) });
    const projectRoot = directory({ 'tests/unit/test_exports.py': EXPORTS(['TestCsvExport']) });
    const reportRoot = junit([
      [
        'tests/unit/test_exports.py',
        'tests.unit.test_exports.TestCsvExport',
        'test_exports_all_rows',
        7,
        1,
      ],
    ]);

    expect(readSlowTestFindings({ reportRoot, projectRoot, baselineRoot })).toEqual([]);
  });
});

const MIXIN =
  'import time\n\n\nclass SyncMixin:\n    def test_full_sync(self):\n        time.sleep(6)\n';
const SHAPE_TEST = (classes) =>
  [
    'import unittest\n\nfrom tests.mixins import SyncMixin\n',
    ...classes.map((name) => `\nclass ${name}(SyncMixin, unittest.TestCase):\n    pass\n`),
  ].join('\n');
const FACTORY = (cases) =>
  [
    'import time\n\n\ndef make_case(seconds):\n    def case():\n        time.sleep(seconds)\n\n    return case\n',
    ...cases.map((name) => `\n${name} = make_case(6)\n`),
  ].join('\n');

describe('tests defined somewhere other than the test name says', () => {
  it('counts an inherited test only when its class or its definition is new or edited', () => {
    const baselineRoot = directory({
      'tests/mixins.py': MIXIN,
      'tests/test_shape.py': SHAPE_TEST(['AreaTest']),
    });
    const projectRoot = directory({
      'tests/mixins.py': MIXIN,
      'tests/test_shape.py': SHAPE_TEST(['AreaTest', 'VolumeTest']),
    });
    const reportRoot = junit([
      ['tests/mixins.py', 'tests.test_shape.AreaTest', 'test_full_sync', 6, 4],
      ['tests/mixins.py', 'tests.test_shape.VolumeTest', 'test_full_sync', 6, 4],
    ]);

    expect(
      readSlowTestFindings({ reportRoot, projectRoot, baselineRoot }).map(
        ({ path: file, location, identity, message }) => [
          file,
          location,
          identity,
          message.split(' took')[0],
        ],
      ),
    ).toEqual([
      [
        'tests/mixins.py',
        { line: 5 },
        'test:tests/test_shape.py::VolumeTest::test_full_sync',
        'VolumeTest.test_full_sync',
      ],
    ]);
  });
  it('counts a test a factory builds only when the line that names it is new or edited', () => {
    const baselineRoot = directory({ 'tests/test_bulk.py': FACTORY(['test_bulk_import']) });
    const projectRoot = directory({
      'tests/test_bulk.py': FACTORY(['test_bulk_import', 'test_bulk_export']),
    });
    const reportRoot = junit([
      ['tests/test_bulk.py', 'tests.test_bulk', 'test_bulk_import', 6, 4],
      ['tests/test_bulk.py', 'tests.test_bulk', 'test_bulk_export', 6, 4],
    ]);
    const unchanged = { reportRoot, projectRoot, baselineRoot: projectRoot };

    expect(readSlowTestFindings(unchanged)).toEqual([]);
    expect(
      readSlowTestFindings({ reportRoot, projectRoot, baselineRoot }).map(
        ({ message }) => message.split(' took')[0],
      ),
    ).toEqual(['test_bulk_export']);
  });
});

describe('integration marks on one parametrized case', () => {
  const PARAMETRIZED =
    'import pytest\n\n\n@pytest.mark.parametrize(\n    "case",\n    [pytest.param(1, marks=pytest.mark.integration), 2],\n)\ndef test_param_mark(case):\n    pass\n';
  it('gives the 30 s budget only to the marked case, from the recorded marks', () => {
    const projectRoot = directory({ 'tests/test_variants.py': PARAMETRIZED });
    const reportRoot = directory({
      'pytest-junit.xml': [
        '<testsuite>',
        '<testcase classname="tests.test_variants" name="test_param_mark[1]" file="tests/test_variants.py" line="3" time="7"><properties><property name="nitpicker_marks" value="integration parametrize"/></properties></testcase>',
        '<testcase classname="tests.test_variants" name="test_param_mark[2]" file="tests/test_variants.py" line="3" time="6"><properties><property name="nitpicker_marks" value="parametrize"/></properties></testcase>',
        '</testsuite>',
      ].join(''),
    });

    expect(
      readSlowTestFindings({ reportRoot, projectRoot }).map(({ message }) => message.split(';')[0]),
    ).toEqual(['test_param_mark took 6.0 s']);
  });
  it('reads no integration mark from inside a pytest.param when no marks were recorded', () => {
    const projectRoot = directory({ 'tests/test_variants.py': PARAMETRIZED });
    const reportRoot = junit([
      ['tests/test_variants.py', 'tests.test_variants', 'test_param_mark[2]', 6, 3],
    ]);

    expect(readSlowTestFindings({ reportRoot, projectRoot })).toHaveLength(1);
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

function timed(projectRoot, script, args) {
  const reportRoot = directory();
  const report = path.join(reportRoot, 'pytest-junit.xml');
  const reportArgument = script === UNITTEST_SCRIPT ? report : `--junitxml=${report}`;
  const result = spawnSync('python3', [script, reportArgument, ...args], {
    cwd: projectRoot,
    encoding: 'utf8',
  });
  return { reportRoot, output: `${result.stdout}${result.stderr}` };
}

function pytestUsable() {
  return spawnSync('python3', ['-c', 'import pytest'], { encoding: 'utf8' }).status === 0;
}

const SLOW_MIXIN =
  'import time\n\n\nclass SlowMixin:\n    def test_sync(self):\n        time.sleep(0.3)\n';

describe.skipIf(!pythonUsable())('slow unittest tests', () => {
  it('times each unittest test in its own run, without the class setup', () => {
    const projectRoot = directory({
      'tests/__init__.py': '',
      'tests/test_shape.py': UNITTEST_CASES,
    });
    const { reportRoot, output } = timed(projectRoot, UNITTEST_SCRIPT, [
      'discover',
      '-s',
      'tests',
      '-t',
      '.',
    ]);

    expect(output).toMatch(/Ran 2 tests/u);
    expect(
      readSlowTestFindings({
        reportRoot,
        projectRoot,
        testRunner: 'unittest',
        limits: { unitTestSeconds: 0.2 },
      }).map(({ path: file, location, message }) => [file, location, message.split(' took')[0]]),
    ).toEqual([['tests/test_shape.py', { line: 13 }, 'ShapeTest.test_slow']]);
  });
  it('reports an inherited test where it is defined, and leaves it out while nothing changed', () => {
    const files = {
      'tests/__init__.py': '',
      'tests/mixins.py': SLOW_MIXIN,
      'tests/test_api.py':
        'import unittest\n\nfrom tests.mixins import SlowMixin\n\n\nclass ApiTest(SlowMixin, unittest.TestCase):\n    pass\n',
    };
    const projectRoot = directory(files);
    const { reportRoot } = timed(projectRoot, UNITTEST_SCRIPT, [
      'discover',
      '-s',
      'tests',
      '-t',
      '.',
    ]);
    const options = { reportRoot, projectRoot, limits: { unitTestSeconds: 0.2 } };

    expect(
      readSlowTestFindings(options).map(({ path: file, location, message }) => [
        file,
        location,
        message.split(' took')[0],
      ]),
    ).toEqual([['tests/mixins.py', { line: 5 }, 'ApiTest.test_sync']]);
    expect(readSlowTestFindings({ ...options, baselineRoot: directory(files) })).toEqual([]);
  });
});

describe.skipIf(!pytestUsable())('slow pytest tests through the timing plugin', () => {
  it('charges function-scoped fixtures and setup_method, not shared setup, and marks per case', () => {
    const projectRoot = directory({
      'tests/test_api.py': [
        'import time\n\nimport pytest\n\n',
        '@pytest.fixture(scope="module")\ndef shared():\n    time.sleep(0.3)\n\n',
        '@pytest.fixture\ndef client(shared, seconds):\n    time.sleep(seconds)\n\n',
        '@pytest.mark.parametrize(\n    "seconds", [pytest.param(0.3, marks=pytest.mark.integration), 0.3, 0]\n)\ndef test_call(client):\n    pass\n\n',
        'class TestOrders:\n    @classmethod\n    def setup_class(cls):\n        time.sleep(0.3)\n\n    def setup_method(self):\n        time.sleep(0.3)\n\n    def test_create(self):\n        pass\n',
      ].join('\n'),
    });
    const { reportRoot } = timed(projectRoot, PYTEST_SCRIPT, [
      '-q',
      '-p',
      'no:cacheprovider',
      '-o',
      'junit_family=xunit1',
      '-o',
      'junit_duration_report=call',
    ]);
    const options = {
      reportRoot,
      projectRoot,
      limits: { unitTestSeconds: 0.2, integrationTestSeconds: 1 },
    };

    expect(readSlowTestFindings(options).map(({ message }) => message.split(' took')[0])).toEqual([
      'test_call',
      'TestOrders.test_create',
    ]);
  });
});
