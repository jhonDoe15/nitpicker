import accessibility from 'eslint-plugin-jsx-a11y-x';
import hooks from 'eslint-plugin-react-hooks';
import reactDom from 'eslint-plugin-react-dom';
import reactWebApi from 'eslint-plugin-react-web-api';
import reactX from 'eslint-plugin-react-x';
import testingLibrary from 'eslint-plugin-testing-library';
import { inReactTestFilesOnly } from '../eslint-plugin/rules/react-test-files.mjs';
import {
  accessibilityRuleNames,
  EXCEPTION_HINT,
  GENERAL_HINT,
  testingLibraryHints,
} from './react-rules.mjs';
import { reactDomHints, reactWebApiHints, reactXHints } from './react/third-party-rules.mjs';
import { withHint, withoutFixes } from './rule-hints.mjs';

const accessibilityRulePrefix = 'jsx-a11y-x';

function hintedRules(plugin, hints) {
  return Object.fromEntries(
    Object.entries(hints).map(([name, hint]) => [name, withoutFixes(withHint(plugin.rules[name], hint))]),
  );
}

export const reactPlugins = {
  'react-hooks': {
    rules: {
      'rules-of-hooks': withHint(hooks.rules['rules-of-hooks'], GENERAL_HINT),
      'exhaustive-deps': withHint(
        hooks.rules['exhaustive-deps'],
        ` If a dependency is deliberately left out, ${EXCEPTION_HINT}`,
      ),
    },
  },
  'react-dom': { rules: hintedRules(reactDom, reactDomHints) },
  'react-web-api': { rules: hintedRules(reactWebApi, reactWebApiHints) },
  'react-x': {
    rules: {
      ...hintedRules(reactX, reactXHints),
      'no-class-component': withHint(reactX.rules['no-class-component'], GENERAL_HINT),
      'no-array-index-key': withHint(
        reactX.rules['no-array-index-key'],
        ` Use a stable id from the item (\`key={todo.id}\`). For a static list that never changes order, ${EXCEPTION_HINT}`,
      ),
    },
  },
  'jsx-a11y': {
    rules: Object.fromEntries(
      accessibilityRuleNames.map((name) => [
        name,
        withHint(accessibility.rules[name], GENERAL_HINT),
      ]),
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
