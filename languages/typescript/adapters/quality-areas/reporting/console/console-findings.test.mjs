import { describe, expect, it } from 'vitest';
import { compareFindings } from '../../../../../../core/diff/comparison/compare.mjs';
import { testConsoleFindings } from './console-findings.mjs';

function entry(file, message, test = 'works') {
  return { file, test, messages: [message] };
}

function findingsOf(entries, options = {}) {
  return testConsoleFindings({ entries }, { analyzerName: 'test-console', ...options });
}

function newMessages(base, head, options) {
  const { newFindings } = compareFindings({
    baseFindings: findingsOf(base, options),
    headFindings: findingsOf(head, options),
  });
  return newFindings.map(({ path, message }) => [path, message.split('. ')[0]]);
}

describe('console output findings', () => {
  it('reports each distinct message once per test file, as an enforceable finding', () => {
    const findings = findingsOf([
      entry('test/a.test.ts', 'Warning: leaked timer'),
      entry('test/a.test.ts', 'Warning: leaked timer', 'other test'),
      entry('test/b.test.ts', 'Warning: leaked timer'),
    ]);

    expect(findings.map(({ path, rule, classification }) => [path, rule, classification])).toEqual([
      ['test/a.test.ts', 'test-console-output', 'enforceable'],
      ['test/b.test.ts', 'test-console-output', 'enforceable'],
    ]);
  });

  it('names the test, the fix, the config route and the exception in the message', () => {
    const [finding] = findingsOf([entry('test/a.test.ts', 'Warning: leaked timer', 'unmounts')]);

    expect(finding.message).toBe(
      'Tests print new console output: "Warning: leaked timer" (test "unmounts"). Fix the cause (for example a timer that outlives the test), or allow a third-party message in "testConsole.allow" of nitpicker.config.json. If this is intended, add {"rule":"test-console-output","paths":["test/a.test.ts"],"reason":"..."} to "exceptions" in nitpicker.config.json.',
    );
  });

  it('fails only for a message the base run did not print', () => {
    const base = [entry('test/a.test.ts', 'Deprecated: old api')];
    const head = [
      entry('test/a.test.ts', 'Deprecated: old api'),
      entry('test/a.test.ts', 'Warning: state update after unmount'),
    ];

    expect(newMessages(base, head)).toEqual([
      [
        'test/a.test.ts',
        'Tests print new console output: "Warning: state update after unmount" (test "works")',
      ],
    ]);
  });

  it.each([
    [
      'a path, position and time',
      'Slow at /ci/1/x.ts:10:2 on 2026-01-01T00:00:00Z',
      'Slow at /ci/2/x.ts:90:5 on 2026-03-04T05:06:07Z',
    ],
    ['a pid and a duration', 'worker 4821 took 0.766s', 'worker 977 took 1.204s'],
  ])('does not treat an old message as new when only %s changed', (_name, before, after) => {
    expect(
      newMessages([entry('test/a.test.ts', before)], [entry('test/a.test.ts', after)]),
    ).toEqual([]);
  });

  it.each([
    ['Error: boom kqzmwa', 'Error: boom xvbnrt'],
    ["{ id: 'kqzmwa', n: 4 }", "{ id: 'xvbnrt', n: 9 }"],
  ])('does not treat %j as new when one random token changed', (before, after) => {
    expect(
      newMessages([entry('test/a.test.ts', before)], [entry('test/a.test.ts', after)]),
    ).toEqual([]);
  });

  it.each([
    ['Error: boom', 'Error: bang'],
    ['Error: boom kqzmwa', 'Error: bang xvbnrt'],
    ['level: warn code: OLD', 'level: warn code: FATAL extra: yes'],
  ])('treats %j then %j as a new message', (before, after) => {
    expect(
      newMessages([entry('test/a.test.ts', before)], [entry('test/a.test.ts', after)]),
    ).toHaveLength(1);
  });

  it.each([
    [
      'Warning: Each child should have a unique "key" prop. Check the render method of `List`.',
      'Warning: Each child should have a unique "key" prop. Check the render method of `Table`.',
    ],
    [
      'Warning: Each child should have a unique "key" prop.',
      'Warning: Each child should have a unique "ref" prop.',
    ],
    ['Warning: Cannot update a component', 'Warning: Cannot update a element'],
    ['Warning: Unknown handler `onFoo` ignored', 'Warning: Unknown handler `onBar` ignored'],
    ['deprecated: use fooBar instead', 'deprecated: use bazQux instead'],
    ["{ code: 'ECONNREFUSED', more: <n> }", "{ code: 'ENOTFOUND', more: <n> }"],
  ])('treats a changed ordinary word in %j as a new message', (before, after) => {
    expect(
      newMessages([entry('test/a.test.ts', before)], [entry('test/a.test.ts', after)]),
    ).toHaveLength(1);
  });

  it('reports an error whose cause differs in more than one word', () => {
    const before = 'Error: outer [cause]: Error: disk is full';
    const after = 'Error: outer [cause]: Error: permission denied';

    expect(
      newMessages([entry('test/a.test.ts', before)], [entry('test/a.test.ts', after)]),
    ).toHaveLength(1);
  });

  it('does not treat a message as new when the test was renamed', () => {
    const base = [entry('test/a.test.ts', 'Deprecated: old api', 'old name')];
    const head = [entry('test/a.test.ts', 'Deprecated: old api', 'new name')];

    expect(newMessages(base, head)).toEqual([]);
  });

  it('reports a message that moved to another test file as new there', () => {
    const base = [entry('test/a.test.ts', 'Deprecated: old api')];
    const head = [entry('test/b.test.ts', 'Deprecated: old api')];

    expect(newMessages(base, head).map(([file]) => file)).toEqual(['test/b.test.ts']);
  });

  it('attributes output outside any test to the project', () => {
    const [finding] = findingsOf([entry('', 'Global warning', '')]);

    expect(finding.path).toBe('.');
  });
});

describe('console output allowlist and exceptions', () => {
  const entries = [
    entry('test/a.test.ts', 'ReactDOM.render is no longer supported'),
    entry('test/a.test.ts', 'Warning: leaked timer'),
    entry('legacy/b.test.ts', 'Warning: leaked timer'),
  ];

  it('skips a message that contains an allowed substring', () => {
    const allow = [{ contains: 'is no longer supported', reason: 'react 17 shim' }];

    expect(findingsOf(entries, { allow }).map(({ path }) => path)).toEqual([
      'legacy/b.test.ts',
      'test/a.test.ts',
    ]);
  });

  it('normalizes the allowed substring like a message, so numbers match', () => {
    const allow = [{ contains: 'waited 250 ms', reason: 'slow shim' }];

    expect(findingsOf([entry('test/a.test.ts', 'waited 31 ms for a lock')], { allow })).toEqual([]);
  });

  it('matches an allowed substring against the whole message, not a placeholder alone', () => {
    const allow = [{ contains: 'waited 250 ms', reason: 'slow shim' }];

    expect(findingsOf([entry('test/a.test.ts', 'retry in 31 ms')], { allow })).toHaveLength(1);
  });

  it('limits an allowed message to the listed paths', () => {
    const allow = [{ contains: 'leaked timer', paths: ['legacy/**'], reason: 'old suite' }];

    expect(findingsOf(entries, { allow }).map(({ path }) => path)).toEqual([
      'test/a.test.ts',
      'test/a.test.ts',
    ]);
  });

  it('skips every message of a test file lifted by an exception', () => {
    const exceptions = [{ rule: 'test-console-output', paths: ['legacy/**'], reason: 'old suite' }];

    expect(findingsOf(entries, { exceptions }).map(({ path }) => path)).toEqual([
      'test/a.test.ts',
      'test/a.test.ts',
    ]);
  });

  it('leaves exceptions for other rules alone', () => {
    const exceptions = [{ rule: 'file-lines-limit', paths: ['**'], reason: 'unrelated' }];

    expect(findingsOf(entries, { exceptions })).toHaveLength(3);
  });
});
