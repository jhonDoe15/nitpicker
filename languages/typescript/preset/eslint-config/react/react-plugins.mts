import type { Rule } from 'eslint';
import accessibility from 'eslint-plugin-jsx-a11y-x';
import hooks from 'eslint-plugin-react-hooks';
import reactDom from 'eslint-plugin-react-dom';
import reactWebApi from 'eslint-plugin-react-web-api';
import reactX from 'eslint-plugin-react-x';
import testingLibrary from 'eslint-plugin-testing-library';
import { inReactTestFilesOnly as untypedInReactTestFilesOnly } from '../../eslint-plugin/rules/react-tests/react-test-files.mjs';
import { accessibilityRuleNames, testingLibraryHints } from './react-rules.mjs';
import { accessibilityHints, accessibilityOptionOverrides } from './rules/accessibility-rules.mjs';
import {
  reactDomHints,
  reactWebApiHints,
  reactXHints,
  typedReactXRules,
} from './rules/third-party-rules.mjs';
import { fieldOf, listOf } from '../../../../../shared/values/readers.mts';
import { ruleNamed, withHint, withoutFixes } from '../typed/rule-views.mts';
import { createdByCallOnly } from './rules/static-components.mts';
import { outsideKeyAttributes } from './rules/purity-outside-keys.mts';

type Node = MemberExpression['object'];
type Program = Parameters<NonNullable<Rule.RuleListener['Program']>>[0];
type CallExpression = Parameters<NonNullable<Rule.RuleListener['CallExpression']>>[0];
type ImportDeclaration = Extract<Program['body'][number], { type: 'ImportDeclaration' }>;
type MemberExpression = Extract<CallExpression['callee'], { type: 'MemberExpression' }>;

type RuleTable = Readonly<Record<string, Rule.RuleModule>>;
type Hints = Readonly<Record<string, string>>;
type Locals = { readonly named: string | undefined; readonly namespace: string | undefined };

const inReactTestFilesOnly: (create: Rule.RuleModule['create']) => Rule.RuleModule['create'] =
  untypedInReactTestFilesOnly;
const accessibilityRulePrefix = 'jsx-a11y-x';

function typeChecked(rule: Rule.RuleModule): Rule.RuleModule {
  const docs = { ...rule.meta?.docs, requiresTypeChecking: true };
  return {
    ...rule,
    meta: { ...rule.meta, docs },
  };
}

function hintedRules(rules: unknown, hints: Hints, typedNames: readonly string[] = []): RuleTable {
  return Object.fromEntries(
    Object.entries(hints).map(([name, hint]) => {
      const rule = withoutFixes(withHint(ruleNamed(rules, name), hint));
      return [name, typedNames.includes(name) ? typeChecked(rule) : rule];
    }),
  );
}

export const reactPlugins: Readonly<Record<string, { readonly rules: RuleTable }>> = {
  'react-hooks': {
    rules: {
      'rules-of-hooks': ruleNamed(hooks.rules, 'rules-of-hooks'),
      'exhaustive-deps': withHint(
        ruleNamed(hooks.rules, 'exhaustive-deps'),
        ' An exception fits only when a dependency is deliberately left out.',
      ),
    },
  },
  'react-dom': { rules: hintedRules(reactDom.rules, reactDomHints) },
  'react-web-api': { rules: hintedRules(reactWebApi.rules, reactWebApiHints) },
  'react-x': {
    rules: hintedRules(
      {
        ...reactX.rules,
        purity: outsideKeyAttributes(ruleNamed(reactX.rules, 'purity')),
        'static-components': createdByCallOnly(ruleNamed(reactX.rules, 'static-components')),
      },
      reactXHints,
      typedReactXRules,
    ),
  },
  'jsx-a11y': {
    rules: Object.fromEntries(
      accessibilityRuleNames.map((name) => [
        name,
        accessibilityHintFor(name) === undefined
          ? accessibilityRule(name)
          : withHint(accessibilityRule(name), String(accessibilityHintFor(name))),
      ]),
    ),
  },
};

function accessibilityRule(name: string): Rule.RuleModule {
  return ruleNamed(fieldOf(accessibility, 'rules'), name);
}

function accessibilityHintFor(name: string): string | undefined {
  const hints: Hints = accessibilityHints;
  return hints[name];
}

function recommendedOptions(name: string): readonly unknown[] {
  const rules = fieldOf(fieldOf(fieldOf(accessibility, 'configs'), 'recommended'), 'rules');
  return listOf(fieldOf(rules, `${accessibilityRulePrefix}/${name}`)).slice(1);
}

function accessibilityOverridesFor(name: string): readonly unknown[] | undefined {
  const overrides: Readonly<Record<string, readonly unknown[]>> = accessibilityOptionOverrides;
  return overrides[name];
}

export const accessibilityRuleOptions = Object.fromEntries(
  accessibilityRuleNames.map((name) => [
    `jsx-a11y/${name}`,
    ['error', ...(accessibilityOverridesFor(name) ?? recommendedOptions(name))],
  ]),
);

const USER_EVENT_MODULE = '@testing-library/user-event';

function isUserEventImport(statement: Program['body'][number]): statement is ImportDeclaration {
  return statement.type === 'ImportDeclaration' && statement.source.value === USER_EVENT_MODULE;
}

function userEventImports(program: Program): ImportDeclaration[] {
  return program.body.filter(isUserEventImport);
}

function namedUserEvent(declaration: ImportDeclaration): string | undefined {
  return declaration.specifiers.find(
    (specifier) =>
      specifier.type === 'ImportSpecifier' &&
      specifier.imported.type === 'Identifier' &&
      specifier.imported.name === 'userEvent',
  )?.local.name;
}

function namespaceUserEvent(declaration: ImportDeclaration): string | undefined {
  return declaration.specifiers.find(({ type }) => type === 'ImportNamespaceSpecifier')?.local.name;
}

const namespaceMembers = new Set(['userEvent', 'default']);

function propertyName(property: MemberExpression['property']): string | undefined {
  return 'name' in property ? property.name : undefined;
}

function isUserEventReceiver(node: Node, locals: Locals): boolean {
  if (node.type === 'Identifier') {
    return node.name === locals.named;
  }
  return (
    node.type === 'MemberExpression' &&
    !node.computed &&
    node.object.type === 'Identifier' &&
    node.object.name === locals.namespace &&
    namespaceMembers.has(String(propertyName(node.property)))
  );
}

function directCall(node: CallExpression, locals: Locals): MemberExpression | undefined {
  const { callee } = node;
  return callee.type === 'MemberExpression' &&
    !callee.computed &&
    isUserEventReceiver(callee.object, locals) &&
    propertyName(callee.property) !== 'setup'
    ? callee
    : undefined;
}

function withNamedUserEventImport(rule: Rule.RuleModule): Rule.RuleModule {
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
              data: { method: String(propertyName(callee.property)) },
            });
          }
        },
      };
    },
  };
}

const extendedTestingLibraryRules = {
  'prefer-user-event-setup': withNamedUserEventImport(
    ruleNamed(testingLibrary.rules, 'prefer-user-event-setup'),
  ),
};

function testingLibraryRule(name: string, hint: string): Rule.RuleModule {
  const upstream =
    name === 'prefer-user-event-setup'
      ? extendedTestingLibraryRules['prefer-user-event-setup']
      : ruleNamed(testingLibrary.rules, name);
  const rule = withoutFixes(withHint(upstream, hint));
  return { ...rule, create: inReactTestFilesOnly((context) => rule.create(context)) };
}

export const testingLibraryPlugin = {
  rules: Object.fromEntries(
    Object.entries(testingLibraryHints).map(([name, hint]) => [
      name,
      testingLibraryRule(name, hint),
    ]),
  ),
};
