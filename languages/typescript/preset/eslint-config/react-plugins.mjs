import accessibility from 'eslint-plugin-jsx-a11y-x';
import hooks from 'eslint-plugin-react-hooks';
import reactX from 'eslint-plugin-react-x';
import testingLibrary from 'eslint-plugin-testing-library';
import { inReactTestFilesOnly } from '../eslint-plugin/rules/react-test-files.mjs';
import {
  accessibilityRuleNames,
  EXCEPTION_HINT,
  GENERAL_HINT,
  testingLibraryHints,
} from './react-rules.mjs';
import { withHint, withoutFixes } from './rule-hints.mjs';

const accessibilityRulePrefix = 'jsx-a11y-x';

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
  'react-x': {
    rules: {
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

const USER_EVENT_MODULE = '@testing-library/user-event';

function userEventImports(program) {
  return program.body.filter(
    (statement) =>
      statement.type === 'ImportDeclaration' && statement.source.value === USER_EVENT_MODULE,
  );
}

function namedUserEvent(declaration) {
  return declaration.specifiers.find(
    (specifier) =>
      specifier.type === 'ImportSpecifier' &&
      specifier.imported.type === 'Identifier' &&
      specifier.imported.name === 'userEvent',
  )?.local.name;
}

function directCall(node, local) {
  const { callee } = node;
  return callee.type === 'MemberExpression' &&
    !callee.computed &&
    callee.object.type === 'Identifier' &&
    callee.object.name === local &&
    callee.property.name !== 'setup'
    ? callee
    : undefined;
}

function withNamedUserEventImport(rule) {
  return {
    ...rule,
    create(context) {
      const upstream = rule.create(context);
      const imports = userEventImports(context.sourceCode.ast);
      const hasDefault = imports.some((declaration) =>
        declaration.specifiers.some(({ type }) => type === 'ImportDefaultSpecifier'),
      );
      const local = imports.map(namedUserEvent).find((name) => name !== undefined);
      if (hasDefault || local === undefined) {
        return upstream;
      }
      return {
        ...upstream,
        CallExpression(node) {
          upstream.CallExpression?.(node);
          const callee = directCall(node, local);
          if (callee !== undefined) {
            context.report({
              node: callee,
              messageId: 'preferUserEventSetup',
              data: { method: callee.property.name },
            });
          }
        },
      };
    },
  };
}

const extendedTestingLibraryRules = {
  'prefer-user-event-setup': withNamedUserEventImport(
    testingLibrary.rules['prefer-user-event-setup'],
  ),
};

function testingLibraryRule(name, hint) {
  const upstream = extendedTestingLibraryRules[name] ?? testingLibrary.rules[name];
  const rule = withoutFixes(withHint(upstream, hint));
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
