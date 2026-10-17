import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readSlowTestFindings } from './slow-test-findings.mjs';
import { SLOW_TESTS_REPORT } from './slow-test-step.mjs';

const RECORD = {
  path: 'tests/test_pay.py',
  identity: 'test:tests.test_pay#test_slow',
  name: 'test_pay test_slow',
  seconds: 6,
  runner: 'pytest',
  line: 4,
  integration: false,
  changed: true,
};
let reportRoot;

function writeReport(records, notices = []) {
  writeFileSync(
    path.join(reportRoot, SLOW_TESTS_REPORT),
    JSON.stringify({ tests: records, notices }),
  );
}

beforeEach(() => {
  reportRoot = mkdtempSync(path.join(tmpdir(), 'nitpicker-slow-findings-'));
});

afterEach(() => {
  rmSync(reportRoot, { recursive: true, force: true });
});

describe('slow test findings of the Python run', () => {
  it('reports nothing when no test was timed', () => {
    expect(readSlowTestFindings(reportRoot, undefined)).toEqual([]);
  });

  it('fails a test over its budget and leaves quick tests alone', () => {
    writeReport([
      RECORD,
      { ...RECORD, identity: 'test:tests.test_pay#test_ok', seconds: 4.9 },
      { ...RECORD, identity: 'test:tests.test_pay#test_it', seconds: 29, integration: true },
    ]);
    expect(readSlowTestFindings(reportRoot, undefined).map(({ identity }) => identity)).toEqual([
      'test:tests.test_pay#test_slow',
    ]);
    expect(
      readSlowTestFindings(reportRoot, { unitTestSeconds: 4, integrationTestSeconds: 20 }).map(
        ({ identity }) => identity,
      ),
    ).toEqual([
      'test:tests.test_pay#test_slow',
      'test:tests.test_pay#test_ok',
      'test:tests.test_pay#test_it',
    ]);
  });

  it('words the finding like the Java one and names the top-level exception', () => {
    writeReport([RECORD]);
    expect(readSlowTestFindings(reportRoot, undefined)).toEqual([
      {
        tool: 'test-runtime',
        rule: 'slow-test',
        path: 'tests/test_pay.py',
        identity: 'test:tests.test_pay#test_slow',
        location: { line: 4 },
        message:
          'test_pay test_slow took 6.0 s; a unit test may take 5 s. Remove time.sleep and other waits ' +
          '(patch the clock) and fake network, database and disk access, or move it to an integration ' +
          'test (an integration or e2e folder under tests, or an integration marker registered in ' +
          'the pytest config) if it is one. If this is intended, add ' +
          '{"rule":"slow-test","paths":["tests/test_pay.py"],"reason":"..."} ' +
          'to "exceptions" in nitpicker.config.json.',
        classification: 'enforceable',
      },
    ]);
  });

  it('gives a unittest project advice that needs no pytest marker', () => {
    writeReport([{ ...RECORD, runner: 'unittest' }]);
    expect(readSlowTestFindings(reportRoot, undefined).map(({ message }) => message)).toEqual([
      'test_pay test_slow took 6.0 s; a unit test may take 5 s. Remove time.sleep and other waits ' +
        '(patch the clock) and fake network, database and disk access, or move it to an integration ' +
        'test (an integration or e2e folder under tests, or a class named Integration*) if it is ' +
        'one. If this is intended, add {"rule":"slow-test","paths":["tests/test_pay.py"],"reason":"..."} ' +
        'to "exceptions" in nitpicker.config.json.',
    ]);
  });

  it('lists the files it could not time as descriptive notices that never fail the run', () => {
    writeReport([], [{ path: 'tests/test_pay.py', message: 'tests/test_pay.py is not checked' }]);
    expect(readSlowTestFindings(reportRoot, undefined)).toEqual([
      {
        tool: 'test-runtime',
        rule: 'slow-test-not-timed',
        path: 'tests/test_pay.py',
        identity: 'slow-test-not-timed:tests/test_pay.py',
        message: 'tests/test_pay.py is not checked',
        classification: 'descriptive',
      },
    ]);
  });
});
