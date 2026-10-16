import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const FACTS = path.join(import.meta.dirname, 'test_facts.py');
const TIMING = path.join(import.meta.dirname, 'unittest_timing.py');
const MODULE = `import pytest

pytestmark = [pytest.mark.system]


@pytest.mark.integration
def test_one():
    pass


class TestPay:
    @pytest.mark.parametrize("amount", [1])
    async def test_two(self, amount):
        pass

    class TestNested:
        def test_three(self):
            pass
`;
let directory;

function python(args) {
  const result = spawnSync('python3', args, { cwd: directory, encoding: 'utf8' });
  expect(result.error).toBeUndefined();
  return result;
}

beforeEach(() => {
  directory = mkdtempSync(path.join(tmpdir(), 'nitpicker-slow-scripts-'));
  mkdirSync(path.join(directory, 'tests'));
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

describe.skipIf(!enabled)('the Python helpers of the slow test gate', () => {
  it('lists every function with its line, markers of its own, its class and the module, and a hash', () => {
    writeFileSync(path.join(directory, 'tests/test_pay.py'), MODULE);
    writeFileSync(path.join(directory, 'tests/test_bad.py'), 'def broken(:\n');
    const { stdout } = python(['-I', FACTS, directory, 'tests/test_pay.py', 'tests/test_bad.py']);
    const facts = JSON.parse(stdout);
    expect(facts['tests/test_bad.py']).toBeNull();
    expect(
      Object.fromEntries(
        Object.entries(facts['tests/test_pay.py']).map(([name, { line, markers }]) => [
          name,
          [line, markers],
        ]),
      ),
    ).toEqual({
      test_one: [7, ['integration', 'system']],
      'TestPay.test_two': [13, ['parametrize', 'system']],
      'TestPay.TestNested.test_three': [17, ['system']],
    });
    expect(Object.values(facts['tests/test_pay.py']).map(({ hash }) => hash.length)).toEqual([
      40, 40, 40,
    ]);
  });

  it('changes the hash of a function only when its text, decorators included, changes', () => {
    const file = path.join(directory, 'tests/test_pay.py');
    writeFileSync(file, MODULE);
    const before = JSON.parse(python(['-I', FACTS, directory, 'tests/test_pay.py']).stdout);
    writeFileSync(
      file,
      MODULE.replace('def test_one():\n    pass', 'def test_one():\n    assert 1'),
    );
    const after = JSON.parse(python(['-I', FACTS, directory, 'tests/test_pay.py']).stdout);
    const names = Object.keys(before['tests/test_pay.py']);
    expect(
      names.map(
        (name) => before['tests/test_pay.py'][name].hash === after['tests/test_pay.py'][name].hash,
      ),
    ).toEqual([false, true, true]);
  });

  it('runs unittest discovery and writes the time of each test as JUnit XML', () => {
    writeFileSync(
      path.join(directory, 'tests/test_clock.py'),
      'import time\nimport unittest\n\n\nclass TestClock(unittest.TestCase):\n    def test_wait(self):\n        time.sleep(0.2)\n\n    def test_now(self):\n        self.assertTrue(True)\n',
    );
    const output = path.join(directory, 'times.xml');
    const result = python([TIMING, output, 'discover', '-s', 'tests']);
    expect(result.status).toBe(0);
    expect(result.stderr).toMatch(/Ran 2 tests/u);
    const cases = [
      ...readFileSync(output, 'utf8').matchAll(
        /classname="([^"]+)" name="([^"]+)" time="([\d.]+)"/gu,
      ),
    ];
    expect(cases.map(([, className, name]) => `${className}.${name}`).sort()).toEqual([
      'test_clock.TestClock.test_now',
      'test_clock.TestClock.test_wait',
    ]);
    const seconds = Object.fromEntries(cases.map(([, , name, time]) => [name, Number(time)]));
    expect(seconds.test_wait).toBeGreaterThanOrEqual(0.15);
    expect(seconds.test_now).toBeLessThan(seconds.test_wait);
  });

  it('exits non-zero when a test fails, as unittest does', () => {
    writeFileSync(
      path.join(directory, 'tests/test_bad.py'),
      'import unittest\n\n\nclass TestBad(unittest.TestCase):\n    def test_fail(self):\n        self.fail("no")\n',
    );
    expect(
      python([TIMING, path.join(directory, 'times.xml'), 'discover', '-s', 'tests']).status,
    ).toBe(1);
  });
});
