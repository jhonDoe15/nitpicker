import { beforeAll, describe, expect, it } from 'vitest';
import { applySuggestions } from './apply-suggestions.mts';
import { lintCases } from './test-support/lint-cases.mts';
import { suggestionName, type LintMessage } from './typed/suggestion-views.mts';

const RULE = '@typescript-eslint/no-unnecessary-type-conversion';
const PRELUDE = 'declare function read(): string;\n\n';

const CONVERSIONS: readonly (readonly [string, string, string])[] = [
  ['text: string', 'String(text)', 'text'],
  ['text: string', "text + ''", 'text'],
  ['text: string', 'text.toString()', 'text'],
  ['count: number', '+count', 'count'],
  ['count: number', 'Number(count)', 'count'],
  ['flag: boolean', '!!flag', 'flag'],
  ['flag: boolean', 'Boolean(flag)', 'flag'],
  ['_: unknown', 'String(read())', 'read()'],
];

function moduleOf(parameter: string, expression: string): string {
  return `${PRELUDE}export function same(${parameter}): unknown {\n  return ${expression};\n}\n`;
}

let linted: Map<string, readonly LintMessage[]>;

beforeAll(async () => {
  linted = await lintCases(
    Object.fromEntries(
      CONVERSIONS.map(([parameter, expression]) => [expression, moduleOf(parameter, expression)]),
    ),
  );
});

describe('the no-unnecessary-type-conversion suggestion that removes the conversion', () => {
  it.each(CONVERSIONS)(
    'turns (%s) => %s into %s when the rule is selected',
    (parameter, from, to) => {
      const text = moduleOf(parameter, from);
      const messages = (linted.get(from) ?? []).filter(({ ruleId }) => ruleId === RULE);

      expect(applySuggestions({ text, messages }).text).toBe(text);
      expect(applySuggestions({ text, messages, selectedRules: [suggestionName(RULE)] }).text).toBe(
        moduleOf(parameter, to),
      );
    },
  );
});
