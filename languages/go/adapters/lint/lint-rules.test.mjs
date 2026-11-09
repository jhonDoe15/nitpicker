import { describe, expect, it } from 'vitest';
import { lintMessage, lintRule } from './lint-rules.mjs';

describe('Go lint messages', () => {
  it.each([
    [
      {
        tool: 'staticcheck',
        rule: 'S1003',
        message: 'should use strings.Contains(s, "a") instead',
      },
      'should use strings.Contains(s, "a") instead.',
    ],
    [
      { tool: 'staticcheck', rule: 'ST1017', message: "don't use Yoda conditions" },
      "don't use Yoda conditions. Put the variable first: `count == 0`.",
    ],
    [
      {
        tool: 'modernize',
        rule: 'rangeint',
        message: 'for loop can be modernized using range over int',
      },
      'for loop can be modernized using range over int. `go fix ./...` applies this rewrite.',
    ],
    [
      { tool: 'modernize', rule: 'forvar', message: 'copying variable is unneeded' },
      'copying variable is unneeded. Remove the copy; since Go 1.22 every loop iteration has its own variable. `go fix ./...` applies this rewrite.',
    ],
    [
      {
        tool: 'staticcheck',
        rule: 'SA4013',
        message: 'negating a boolean twice has no effect; is this a typo?',
      },
      'negating a boolean twice has no effect; is this a typo?',
    ],
    [
      { tool: 'staticcheck', rule: 'SA4000', message: 'impossible assertion:\n\twrong type\n' },
      'impossible assertion: wrong type.',
    ],
    [
      {
        tool: 'staticcheck',
        rule: 'ST1016',
        message:
          'methods on the same type should have the same receiver name (seen 2x "a", 1x "b")',
      },
      'methods on the same type should have the same receiver name. Use one receiver name for every method of the type.',
    ],
    [
      {
        tool: 'nilerr',
        rule: 'nilerr',
        message: 'error is not nil (lines [6 9]) but it returns nil',
      },
      'error is not nil but it returns nil. Return the error the branch checks: the error when it is set, nil when it is not.',
    ],
    [
      { tool: 'bodyclose', rule: 'bodyclose', message: 'response body must be closed' },
      'response body must be closed. Close it in a deferred call: `defer func() { err = errors.Join(err, response.Body.Close()) }()`.',
    ],
  ])('names the allowed form for %j', (entry, message) => {
    expect(lintMessage(entry)).toBe(message);
  });

  it('prints errcheck findings as unchecked and keeps other rule names', () => {
    expect(['errcheck', 'SA1000', 'nilness'].map(lintRule)).toEqual([
      'unchecked',
      'SA1000',
      'nilness',
    ]);
  });
});
