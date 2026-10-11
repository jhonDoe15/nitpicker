import accessibility from 'eslint-plugin-jsx-a11y-x';
import hooks from 'eslint-plugin-react-hooks';
import reactX from 'eslint-plugin-react-x';
import { accessibilityRuleNames } from './react-rules.mjs';
import { withHint } from './rule-hints.mjs';

const EXCEPTION_HINT = 'add an exception for this rule in nitpicker.config.json.';

const accessibilityRulePrefix = 'jsx-a11y-x';

export const reactPlugins = {
  'react-hooks': {
    rules: {
      'rules-of-hooks': hooks.rules['rules-of-hooks'],
      'exhaustive-deps': withHint(
        hooks.rules['exhaustive-deps'],
        ` If a dependency is deliberately left out, ${EXCEPTION_HINT}`,
      ),
    },
  },
  'react-x': {
    rules: {
      'no-class-component': reactX.rules['no-class-component'],
      'no-array-index-key': withHint(
        reactX.rules['no-array-index-key'],
        ` Use a stable unique id from the item as the key (\`key={todo.id}\`). If the list is static and never reordered or filtered, ${EXCEPTION_HINT}`,
      ),
    },
  },
  'jsx-a11y': {
    rules: Object.fromEntries(
      accessibilityRuleNames.map((name) => [
        name,
        withHint(
          accessibility.rules[name],
          ` If this markup is intentionally exempt, ${EXCEPTION_HINT}`,
        ),
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
