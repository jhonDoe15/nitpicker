import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FACTS_SCRIPT } from './test-facts.mjs';
import { UNITTEST_TIMING_SCRIPT } from './timing-command.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const MODULE = `import pytest

pytestmark: list = [pytest.mark.system]


@pytest.mark.integration
def test_one():
    pass


class TestPay:
    @pytest.mark.parametrize("amount", [1])
    async def test_two(self, amount):
        pass

    class TestNested:
        pytestmark = pytest.mark.slow

        def test_three(self):
            pass
`;
let directory;

function python(args) {
  const result = spawnSync('python3', args, { cwd: directory, encoding: 'utf8' });
  expect(result.error).toBeUndefined();
  return result;
}

function factsOf(...files) {
  const { stdout } = python(['-I', FACTS_SCRIPT, directory, ...files]);
  return JSON.parse(
    stdout
      .split('\n')
      .find((line) => line.startsWith('NITPICKER_FACTS '))
      .slice(16),
  );
}

function timesOf(file) {
  return [
    ...readFileSync(file, 'utf8').matchAll(
      /classname="([^"]+)" name="([^"]+)"(?: file="([^"]+)")? time="[\d.]+"/gu,
    ),
  ]
    .map(([, className, name, source]) => `${className}.${name} ${source}`)
    .sort();
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
    const facts = factsOf('tests/test_pay.py')['tests/test_pay.py'];
    expect(
      Object.fromEntries(
        Object.entries(facts).map(([name, { line, markers }]) => [name, [line, markers]]),
      ),
    ).toEqual({
      test_one: [7, ['integration', 'system']],
      'TestPay.test_two': [13, ['parametrize', 'system']],
      'TestPay.TestNested.test_three': [19, ['slow', 'system']],
    });
    expect(Object.values(facts).map(({ hash }) => hash.length)).toEqual([40, 40, 40]);
  });

  it('gives null for a file it cannot read, parse or walk and still lists the others', () => {
    writeFileSync(path.join(directory, 'tests/test_pay.py'), MODULE);
    writeFileSync(path.join(directory, 'tests/test_bad.py'), 'def broken(:\n');
    writeFileSync(path.join(directory, 'tests/test_deep.py'), `x = ${'1+'.repeat(60000)}1\n`);
    const facts = factsOf(
      'tests/test_pay.py',
      'tests/test_bad.py',
      'tests/test_deep.py',
      'tests/test_missing.py',
    );
    expect(Object.keys(facts)).toEqual([
      'tests/test_pay.py',
      'tests/test_bad.py',
      'tests/test_deep.py',
      'tests/test_missing.py',
    ]);
    expect([
      facts['tests/test_bad.py'],
      facts['tests/test_deep.py'],
      facts['tests/test_missing.py'],
    ]).toEqual([null, null, null]);
  });

  it('changes the hash of a function only when its text, decorators included, changes', () => {
    const file = path.join(directory, 'tests/test_pay.py');
    writeFileSync(file, MODULE);
    const before = factsOf('tests/test_pay.py')['tests/test_pay.py'];
    writeFileSync(
      file,
      MODULE.replace('def test_one():\n    pass', 'def test_one():\n    assert 1'),
    );
    const after = factsOf('tests/test_pay.py')['tests/test_pay.py'];
    expect(Object.keys(before).map((name) => before[name].hash === after[name].hash)).toEqual([
      false,
      true,
      true,
    ]);
  });

  it('runs unittest discovery and writes the time of the passed tests, with their file, as XML', () => {
    writeFileSync(
      path.join(directory, 'tests/test_clock.py'),
      [
        'import time',
        'import unittest',
        '',
        '',
        'class TestClock(unittest.TestCase):',
        '    def test_wait(self):',
        '        time.sleep(0.2)',
        '',
        '    def test_now(self):',
        '        self.assertTrue(True)',
        '',
        '    @unittest.skip("later")',
        '    def test_later(self):',
        '        pass',
        '',
      ].join('\n'),
    );
    const output = path.join(directory, 'times.xml');
    const result = python([UNITTEST_TIMING_SCRIPT, output, 'discover', '-s', 'tests']);
    expect(result.status).toBe(0);
    expect(timesOf(output)).toEqual([
      'test_clock.TestClock.test_now tests/test_clock.py',
      'test_clock.TestClock.test_wait tests/test_clock.py',
    ]);
    const seconds = Object.fromEntries(
      [...readFileSync(output, 'utf8').matchAll(/ name="([^"]+)"[^>]* time="([\d.]+)"/gu)].map(
        ([, name, time]) => [name, Number(time) >= 0.15],
      ),
    );
    expect(seconds).toEqual({ test_now: false, test_wait: true });
  });

  it('exits non-zero when a test fails, as unittest does, and leaves the failed test out', () => {
    writeFileSync(
      path.join(directory, 'tests/test_bad.py'),
      'import unittest\n\n\nclass TestBad(unittest.TestCase):\n    def test_fail(self):\n        self.fail("no")\n',
    );
    const output = path.join(directory, 'times.xml');
    expect(python([UNITTEST_TIMING_SCRIPT, output, 'discover', '-s', 'tests']).status).toBe(1);
    expect(timesOf(output)).toEqual([]);
  });
});
