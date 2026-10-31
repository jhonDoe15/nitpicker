import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  consoleFacts,
  consoleOutputFindings,
  consoleReportEnvironment,
  projectRelative,
  readConsoleReport,
} from './console-output.mjs';

const ROOT = '/work/shop';

function findingsFor(entries, headPolicy = {}) {
  return consoleOutputFindings({ entries }, { projectRoot: ROOT, headPolicy });
}

describe('Python console output', () => {
  it('reports each normalized message once per test file, with the test that printed it', () => {
    const findings = findingsFor([
      {
        file: `${ROOT}/tests/test_cart.py`,
        test: 'TestCart::test_add',
        messages: ['WARNING shop.cart: cart 12 has no owner at /work/shop/src/shop/cart.py'],
      },
      {
        file: `${ROOT}/tests/test_cart.py`,
        test: 'TestCart::test_remove',
        messages: ['WARNING shop.cart: cart 7 has no owner at /work/shop/src/shop/cart.py'],
      },
    ]);

    expect(findings).toEqual([
      {
        tool: 'test-console',
        rule: 'test-console-output',
        path: 'tests/test_cart.py',
        identity: expect.stringMatching(/^console:/),
        message:
          'Tests print new console output: "WARNING shop.cart: cart <n> has no owner at cart.py" (test "TestCart::test_add"). Fix the cause (for example a timer that outlives the test), or allow a third-party message in "testConsole.allow" of nitpicker.config.json. If this is intended, add {"rule":"test-console-output","paths":["tests/test_cart.py"],"reason":"..."} to "exceptions" in nitpicker.config.json.',
        classification: 'enforceable',
        tokens: ['WARNING', 'shop.cart:', 'cart', '<n>', 'has', 'no', 'owner', 'at', 'cart.py'],
      },
    ]);
  });

  it('drops a message that testConsole.allow names for the file', () => {
    const entries = [
      {
        file: `${ROOT}/tests/legacy/test_client.py`,
        test: 'test_call',
        messages: ['DeprecationWarning: old client is deprecated'],
      },
      {
        file: `${ROOT}/tests/test_api.py`,
        test: 'test_call',
        messages: ['old client is deprecated'],
      },
    ];
    const allow = [{ contains: 'old client', paths: ['tests/legacy/**'], reason: 'r' }];

    expect(findingsFor(entries, { testConsole: { allow } }).map(({ path: file }) => file)).toEqual([
      'tests/test_api.py',
    ]);
  });

  it('gives output outside a test file to the project', () => {
    expect(
      findingsFor([{ file: '', test: '', messages: ['UserWarning: no config file found'] }]).map(
        ({ path: file, message }) => [file, message.split('.')[0]],
      ),
    ).toEqual([['.', 'Tests print new console output: "UserWarning: no config file found"']]);
  });

  it('gives the console facts with project-relative files', () => {
    const entries = [
      { file: `${ROOT}/tests/test_a.py`, test: 'test_a', messages: ['UserWarning: x'] },
      { file: '', test: '', messages: ['y'] },
    ];

    expect(consoleFacts({ entries }, ROOT)).toEqual([
      { file: 'tests/test_a.py', test: 'test_a', messages: ['UserWarning: x'] },
      { file: '', test: '', messages: ['y'] },
    ]);
  });

  it('gives a temporary directory the same message whatever its random name', () => {
    const identityOf = (name) =>
      findingsFor([
        { file: `${ROOT}/tests/test_io.py`, test: 'test_io', messages: [`saved to /tmp/${name}`] },
      ])[0].identity;
    const names = ['tmpaeiouaei', 'tmp_x8y2k3j', 'tmpk2j_8xq1', 'tmp4kq9zw2r'];

    expect(new Set(names.map(identityOf)).size).toBe(1);
  });
});

const roots = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('the console report', () => {
  it('reads a missing report as empty, and a tool error when pytest ran tests', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-console-'));
    roots.push(root);

    expect(readConsoleReport(root, { testRunner: 'unittest', testsRan: true })).toEqual({
      report: { entries: [] },
      findings: [],
    });
    expect(readConsoleReport(root, { testRunner: 'pytest', testsRan: false }).findings).toEqual([]);
    expect(readConsoleReport(root, { testRunner: 'pytest', testsRan: true }).findings).toEqual([
      {
        tool: 'test-console',
        rule: 'test-console-report-missing',
        path: '.',
        identity: 'test-console-report-missing',
        message:
          "Test console output was not checked: the pytest run left no test-console.json. nitpicker's console plugin writes it first thing when pytest unconfigures, so the run ended before that: the pytest process was killed or ended itself without unwinding.",
        classification: 'tool-error',
      },
    ]);
  });

  it('names the report file only for a pytest run', () => {
    const reportRoot = '/work/out';

    expect(consoleReportEnvironment({ project: { testRunner: 'pytest' }, reportRoot })).toEqual({
      NITPICKER_CONSOLE_REPORT: path.join(reportRoot, 'test-console.json'),
    });
    expect(consoleReportEnvironment({ project: { testRunner: 'unittest' }, reportRoot })).toEqual(
      {},
    );
  });

  it('reads paths outside the project as the project', () => {
    expect(projectRelative('/work/app', '/work/app/tests/test_a.py')).toBe('tests/test_a.py');
    expect(projectRelative('/work/app', '/elsewhere/test_a.py')).toBe('.');
    expect(projectRelative('/work/app', '')).toBe('.');
  });
});
