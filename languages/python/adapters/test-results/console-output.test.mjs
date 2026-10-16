import { describe, expect, it } from 'vitest';
import { consoleFacts, consoleOutputFindings } from './console-output.mjs';

const ROOT = '/work/shop';

function findingsFor(entries, headPolicy = {}) {
  return consoleOutputFindings({ tests: [], entries }, { projectRoot: ROOT, headPolicy });
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

    expect(consoleFacts({ tests: [], entries }, ROOT)).toEqual([
      { file: 'tests/test_a.py', test: 'test_a', messages: ['UserWarning: x'] },
      { file: '', test: '', messages: ['y'] },
    ]);
  });
});
