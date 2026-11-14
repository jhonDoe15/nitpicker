import { describe, expect, it } from 'vitest';
import { nitpickerRules } from '../../preset/eslint-plugin/index.mjs';
import { fieldOf } from '../../../../shared/values/readers.mts';
import { OWN_SUGGESTION_RULES } from './own-suggestion-rules.mjs';

describe('the nitpicker ESLint rules that offer suggestions', () => {
  it('are the rules of the plugin that declare hasSuggestions', () => {
    const declared = Object.entries(nitpickerRules.rules)
      .filter(([, rule]) => fieldOf(fieldOf(rule, 'meta'), 'hasSuggestions') === true)
      .map(([name]) => name);

    expect([...OWN_SUGGESTION_RULES].toSorted()).toEqual(declared.toSorted());
  });
});
