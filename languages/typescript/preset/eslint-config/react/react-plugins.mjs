import accessibility from 'eslint-plugin-jsx-a11y-x';
import hooks from 'eslint-plugin-react-hooks';
import reactDom from 'eslint-plugin-react-dom';
import reactWebApi from 'eslint-plugin-react-web-api';
import reactX from 'eslint-plugin-react-x';
import testingLibrary from 'eslint-plugin-testing-library';
import { inReactTestFilesOnly } from '../../eslint-plugin/rules/react-tests/react-test-files.mjs';
import { accessibilityRuleNames, testingLibraryHints } from './react-rules.mjs';
import { accessibilityHints, accessibilityOptionOverrides } from './rules/accessibility-rules.mjs';
import {
  reactDomHints,
  reactWebApiHints,
  reactXHints,
  typedReactXRules,
} from './rules/third-party-rules.mjs';
import { EXCEPTION_HINT, GENERAL_HINT, withHint, withoutFixes } from '../rule-hints.mjs';
import { createdByCallOnly } from './rules/static-components.mjs';
import { outsideKeyAttributes } from './rules/purity-outside-keys.mjs';

const accessibilityRulePrefix = 'jsx-a11y-x';

function typeChecked(rule) {
  return {
    ...rule,
    meta: { ...rule.meta, docs: { ...rule.meta.docs, requiresTypeChecking: true } },
  };
}

function hintedRules(plugin, hints, typedNames = []) {
  return Object.fromEntries(
    Object.entries(hints).map(([name, hint]) => {
      const rule = withoutFixes(withHint(plugin.rules[name], hint));
      return [name, typedNames.includes(name) ? typeChecked(rule) : rule];
    }),
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
    rules: hintedRules(
      {
        rules: {
          ...reactX.rules,
          purity: outsideKeyAttributes(reactX.rules.purity),
          'static-components': createdByCallOnly(reactX.rules['static-components']),
        },
      },
      reactXHints,
      typedReactXRules,
    ),
  },
  'jsx-a11y': {
    rules: Object.fromEntries(
      accessibilityRuleNames.map((name) => [
        name,
        withHint(accessibility.rules[name], accessibilityHints[name] ?? GENERAL_HINT),
      ]),
    ),
  },
};

function recommendedOptions(name) {
  const configured = accessibility.configs.recommended.rules[`${accessibilityRulePrefix}/${name}`];
  return Array.isArray(configured) ? configured.slice(1) : [];
}

export const accessibilityRuleOptions = Object.fromEntries(
  accessibilityRuleNames.map((name) => [
    `jsx-a11y/${name}`,
    ['error', ...(accessibilityOptionOverrides[name] ?? recommendedOptions(name))],
  ]),
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

function namespaceUserEvent(declaration) {
  return declaration.specifiers.find(({ type }) => type === 'ImportNamespaceSpecifier')?.local.name;
}

const namespaceMembers = new Set(['userEvent', 'default']);

function isUserEventReceiver(node, locals) {
  if (node.type === 'Identifier') {
    return node.name === locals.named;
  }
  return (
    node.type === 'MemberExpression' &&
    !node.computed &&
    node.object.type === 'Identifier' &&
    node.object.name === locals.namespace &&
    namespaceMembers.has(node.property.name)
  );
}

function directCall(node, locals) {
  const { callee } = node;
  return callee.type === 'MemberExpression' &&
    !callee.computed &&
    isUserEventReceiver(callee.object, locals) &&
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
      const locals = {
        named: imports.map(namedUserEvent).find((name) => name !== undefined),
        namespace: imports.map(namespaceUserEvent).find((name) => name !== undefined),
      };
      if (hasDefault || (locals.named === undefined && locals.namespace === undefined)) {
        return upstream;
      }
      return {
        ...upstream,
        CallExpression(node) {
          upstream.CallExpression?.(node);
          const callee = directCall(node, locals);
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
