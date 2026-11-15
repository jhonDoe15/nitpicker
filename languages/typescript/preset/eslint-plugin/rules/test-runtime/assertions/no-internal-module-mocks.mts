import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { productionModulePath } from '../../../test-isolation/production-source.mts';
import { mockedModuleSource } from '../../analysis/test-code-analysis.mts';
import { nameOf } from '../../typed/node-views.mts';

type MessageId = 'internalMock' | 'internalSpy';

const VITEST_NAMES = ['vi', 'vitest'];
const EXCEPTION_ROUTE = 'An exception fits only when injection is not possible.';

function isVitestAlias(specifier: TSESTree.ImportClause): boolean {
  const imported =
    specifier.type === AST_NODE_TYPES.ImportSpecifier ? nameOf(specifier.imported) : undefined;
  return imported !== undefined && VITEST_NAMES.includes(imported);
}

function trackVitestAliases(aliases: Set<string>, node: TSESTree.ImportDeclaration): void {
  for (const specifier of node.specifiers.filter(isVitestAlias)) {
    aliases.add(specifier.local.name);
  }
}

function trackNamespaces(namespaces: Map<string, string>, node: TSESTree.ImportDeclaration): void {
  for (const specifier of node.specifiers) {
    if (specifier.type === AST_NODE_TYPES.ImportNamespaceSpecifier) {
      namespaces.set(specifier.local.name, node.source.value);
    }
  }
}

function isVitestMember(
  aliases: ReadonlySet<string>,
  callee: TSESTree.Node,
): callee is TSESTree.MemberExpressionNonComputedName {
  const object =
    callee.type === AST_NODE_TYPES.MemberExpression ? nameOf(callee.object) : undefined;
  return (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    object !== undefined &&
    aliases.has(object)
  );
}

export const rule: TSESLint.RuleModule<MessageId> = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      internalMock: `Inject the dependency instead of replacing internal production module {{source}}. ${EXCEPTION_ROUTE}`,
      internalSpy: `Inject the dependency instead of replacing a function of internal production module {{source}} with \`vi.spyOn\`. ${EXCEPTION_ROUTE}`,
    },
  },
  create(context) {
    const aliases = new Set(VITEST_NAMES);
    const productionNamespaces = new Map<string, string>();
    return {
      ImportDeclaration(node) {
        if (node.source.value === 'vitest') {
          trackVitestAliases(aliases, node);
        } else if (productionModulePath(node.source.value, context.filename) !== undefined) {
          trackNamespaces(productionNamespaces, node);
        }
      },
      CallExpression(node) {
        const callee = node.callee;
        if (isVitestMember(aliases, callee) && callee.property.name === 'spyOn') {
          const argument = nameOf(node.arguments[0]);
          const source = argument === undefined ? undefined : productionNamespaces.get(argument);
          if (source !== undefined) {
            context.report({ node, messageId: 'internalSpy', data: { source } });
          }
          return;
        }
        const source = mockedModuleSource(node, aliases);
        if (productionModulePath(source, context.filename) === undefined) {
          return;
        }
        context.report({ node, messageId: 'internalMock', data: { source } });
      },
    };
  },
};
