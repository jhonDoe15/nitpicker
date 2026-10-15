import accessibility from 'eslint-plugin-jsx-a11y-x';
import hooks from 'eslint-plugin-react-hooks';
import reactX from 'eslint-plugin-react-x';
import testingLibrary from 'eslint-plugin-testing-library';
import { inReactTestFilesOnly } from '../eslint-plugin/rules/react-test-files.mjs';
import { accessibilityRuleNames, testingLibraryHints } from './react-rules.mjs';
import { withHint, withoutFixes } from './rule-hints.mjs';

const accessibilityRulePrefix = 'jsx-a11y-x';

export const reactPlugins = {
  'react-hooks': {
    rules: {
      'rules-of-hooks': hooks.rules['rules-of-hooks'],
      'exhaustive-deps': withHint(
        hooks.rules['exhaustive-deps'],
        ' An exception fits only when a dependency is deliberately left out.',
      ),
    },
  },
  'react-x': {
    rules: {
      'no-class-component': reactX.rules['no-class-component'],
      'no-array-index-key': withHint(
        reactX.rules['no-array-index-key'],
        ` Use a stable id from the item (\`key={todo.id}\`). An exception fits only for a static list that never changes order.`,
      ),
    },
  },
  'jsx-a11y': {
    rules: Object.fromEntries(
      accessibilityRuleNames.map((name) => [name, accessibility.rules[name]]),
    ),
  },
};

export const accessibilityRuleOptions = Object.fromEntries(
  accessibilityRuleNames.map((name) => {
    const configured =
      accessibility.configs.recommended.rules[`${accessibilityRulePrefix}/${name}`];
    return [
      `jsx-a11y/${name}`,
      ['error', ...(Array.isArray(configured) ? configured.slice(1) : [])],
    ];
  }),
);

function testingLibraryRule(name, hint) {
  const rule = withoutFixes(withHint(testingLibrary.rules[name], hint));
  return { ...rule, create: inReactTestFilesOnly(rule.create) };
}

export const testingLibraryPlugin = {
  rules: Object.fromEntries(
    Object.entries(testingLibraryHints).map(([name, hint]) => [
      name,
      testingLibraryRule(name, hint),
    ]),
  ),
};
