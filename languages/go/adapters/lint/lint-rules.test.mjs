import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { GOSEC_HINTS } from './gosec-hints.mjs';
import { lintMessage, lintRule } from './lint-rules.mjs';

const LINT_FIXTURES = path.join(import.meta.dirname, '../../lint/fixtures');

function gosecFixtureRules() {
  const files = readdirSync(LINT_FIXTURES, { recursive: true }).filter((file) =>
    file.endsWith('.go'),
  );
  return new Set(
    files.flatMap((file) =>
      [
        ...readFileSync(path.join(LINT_FIXTURES, file), 'utf8').matchAll(/\/\/ want\S* .*/gu),
      ].flatMap(([marker]) => marker.match(/\bG\d{3}\b/gu) ?? []),
    ),
  );
}

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
      { tool: 'gosec', rule: 'G404', message: 'Use of weak random number generator' },
      'Use of weak random number generator. Use crypto/rand (`rand.Text()`, `rand.Read`) for anything an attacker must not guess. For simulations, jitter or sampling, add an exception for this rule with the reason.',
    ],
    [
      {
        tool: 'gosec',
        rule: 'G303',
        message: 'File creation in shared tmp directory without using ioutil.Tempfile',
      },
      'File created at a fixed path in a shared temporary folder. Create the file with `os.CreateTemp("", "name-*")`, or in a folder from `os.MkdirTemp`.',
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

  it('names an allowed form for every gosec rule with a fixture', () => {
    const hinted = new Set(GOSEC_HINTS.map(([rule]) => rule));
    expect([...gosecFixtureRules()].filter((rule) => !hinted.has(rule))).toEqual([]);
    expect(hinted.size).toBe(GOSEC_HINTS.length);
  });
});
