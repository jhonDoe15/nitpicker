import { rule } from './no-uncleared-shared-mock.mts';
import { typescriptRuleTester } from '../../test-support/rule-tester.mts';

const tester = typescriptRuleTester();
const lines = (...parts: string[]) => parts.join('\n');
const IMPORTS = "import { describe, expect, it, vi, beforeEach } from 'vitest';";
const SEND_TESTS = [
  "it('sends once', () => { notify(send); expect(send).toHaveBeenCalledTimes(1); });",
  "it('stays quiet when muted', () => { notify(send, { muted: true }); expect(send).not.toHaveBeenCalled(); });",
];
const shared = (name: string, tests: string, form: string, reset = `${name}.mockClear()`) => ({
  messageId: 'sharedMock',
  data: { name, tests, form, reset },
});

tester.run('no-uncleared-shared-mock', rule, {
  valid: [
    lines(
      IMPORTS,
      'const send = vi.fn();',
      "it('a', () => { expect(send).toHaveBeenCalledTimes(1); });",
    ),
    lines(
      IMPORTS,
      "it('a', () => { const send = vi.fn(); expect(send).toHaveBeenCalledTimes(1); });",
    ),
    lines(
      IMPORTS,
      'const send = vi.fn();',
      'beforeEach(() => { send.mockClear(); });',
      ...SEND_TESTS,
    ),
    lines(
      IMPORTS,
      'const send = vi.fn();',
      'beforeEach(() => { vi.clearAllMocks(); });',
      ...SEND_TESTS,
    ),
    lines(IMPORTS, 'let send = vi.fn();', 'beforeEach(() => { send = vi.fn(); });', ...SEND_TESTS),
    lines(
      IMPORTS,
      'const send = vi.fn();',
      "it('a', () => { notify(send); expect(send).toHaveBeenCalledWith(1); });",
      "it('b', () => { notify(send); expect(send).toHaveBeenCalled(); });",
    ),
    lines(
      IMPORTS,
      "import { send } from './mail';",
      "vi.mock('./mail');",
      'beforeEach(() => { vi.mocked(send).mockReset(); });',
      ...SEND_TESTS,
    ),
    lines(
      "import { mock, it } from 'node:test';",
      'const send = mock.fn();',
      'beforeEach(() => { send.mock.resetCalls(); });',
      "it('a', () => { notify(send); assert.equal(send.mock.callCount(), 1); });",
      "it('b', () => { notify(send); });",
    ),
    lines(IMPORTS, 'const send = vi.fn();', 'afterEach(vi.restoreAllMocks);', ...SEND_TESTS),
    lines(
      IMPORTS,
      'const send = vi.fn();',
      "it('a', () => { notify(send); });",
      "it('b', () => { notify(send); });",
      "it('c', () => { const send = vi.fn(); notify(send); expect(send).toHaveBeenCalledTimes(1); });",
    ),
    lines(
      IMPORTS,
      'const send = vi.fn();',
      'const other = vi.fn();',
      'beforeEach(() => { [send, other].forEach((each) => each.mockClear()); });',
      ...SEND_TESTS,
    ),
    lines(
      IMPORTS,
      'const send = vi.fn();',
      'beforeEach(() => { (send as Mock).mockClear(); });',
      ...SEND_TESTS,
    ),
    lines(
      IMPORTS,
      'const send = vi.fn();',
      'beforeEach(() => { send!.mockClear(); });',
      ...SEND_TESTS,
    ),
    lines(
      IMPORTS,
      'const send = vi.fn();',
      "it('a', () => { send(1); expect(send).toHaveBeenLastCalledWith(1); });",
      "it('b', () => { send(2); expect(send).toHaveBeenLastCalledWith(2); });",
    ),
    lines(
      IMPORTS,
      'const send = vi.fn();',
      "it.each([1])('a %s', () => { notify(send); expect(send).toHaveBeenCalledTimes(1); });",
    ),
  ],
  invalid: [
    {
      code: lines(IMPORTS, 'const send = vi.fn();', ...SEND_TESTS),
      errors: [shared('send', '2', 'toHaveBeenCalledTimes')],
    },
    {
      code: lines(
        IMPORTS,
        "describe('panel', () => {",
        '  const onClick = jest.fn();',
        "  it('a', () => { render(onClick); expect(onClick).toBeCalledTimes(1); });",
        "  it('b', () => { render(onClick); expect(onClick).toBeCalledTimes(2); });",
        '});',
      ),
      errors: [shared('onClick', '2', 'toBeCalledTimes')],
    },
    {
      code: lines(
        IMPORTS,
        "import { send } from './mail';",
        "vi.mock('./mail');",
        "it.each([1, 2])('sends %s', (count) => { notify(count); expect(send).toHaveBeenCalledTimes(1); });",
      ),
      errors: [shared('send', '2', 'toHaveBeenCalledTimes')],
    },
    {
      code: lines(
        IMPORTS,
        'const { send } = vi.hoisted(() => ({ send: vi.fn() }));',
        'const setup = () => notify(send);',
        "it('a', () => { setup(); expect(send.mock.calls[0]).toEqual([1]); });",
        "it('b', () => { setup(); });",
      ),
      errors: [shared('send', '2', 'mock.calls')],
    },
    {
      code: lines(
        IMPORTS,
        'const spy = vi.spyOn(console, "warn").mockImplementation(() => {});',
        'beforeEach(() => { render(spy); });',
        "it('a', () => { expect(vi.mocked(spy)).toHaveBeenCalledOnce(); });",
        "it('b', () => {});",
      ),
      errors: [shared('spy', '2', 'toHaveBeenCalledOnce')],
    },
    {
      code: lines(
        "import { mock, it } from 'node:test';",
        'const send = mock.fn();',
        "it('a', () => { notify(send); assert.equal(send.mock.callCount(), 1); });",
        "it('b', () => { notify(send); });",
      ),
      errors: [shared('send', '2', 'mock.callCount', 'send.mock.resetCalls()')],
    },
  ],
});
