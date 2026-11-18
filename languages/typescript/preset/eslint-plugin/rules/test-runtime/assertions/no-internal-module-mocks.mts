import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { productionModulePath } from '../../../test-isolation/production-source.mts';
import { moduleMocks } from '../../runner-apis/module-mocks.mts';
import { createRunnerApis, runnerApiVisitors } from '../../runner-apis/runner-apis.mts';
import { spiedMember } from '../../runner-apis/runner-doubles.mts';
import { nameOf } from '../../typed/node-views.mts';

type MessageId = 'internalMock' | 'internalSpy';

const EXCEPTION_ROUTE = 'An exception fits only when injection is not possible.';

function trackNamespaces(namespaces: Map<string, string>, node: TSESTree.ImportDeclaration): void {
  for (const specifier of node.specifiers) {
    if (specifier.type === AST_NODE_TYPES.ImportNamespaceSpecifier) {
      namespaces.set(specifier.local.name, node.source.value);
    }
  }
}

export const rule: TSESLint.RuleModule<MessageId> = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      internalMock: `Inject the dependency instead of replacing internal production module {{source}}. ${EXCEPTION_ROUTE}`,
      internalSpy: `Inject the dependency instead of replacing a function of internal production module {{source}} with a spy or stub. ${EXCEPTION_ROUTE}`,
    },
  },
  create(context) {
    const apis = createRunnerApis();
    const visitors = runnerApiVisitors(apis);
    const productionNamespaces = new Map<string, string>();
    return {
      ...visitors,
      ImportDeclaration(node) {
        visitors.ImportDeclaration(node);
        if (productionModulePath(node.source.value, context.filename) !== undefined) {
          trackNamespaces(productionNamespaces, node);
        }
      },
      CallExpression(node) {
        const spied = spiedMember(apis, node);
        if (spied !== undefined) {
          const target = nameOf(spied.target);
          const source = target === undefined ? undefined : productionNamespaces.get(target);
          if (source !== undefined) {
            context.report({ node, messageId: 'internalSpy', data: { source } });
          }
          return;
        }
        for (const { name } of moduleMocks(apis, node)) {
          if (name !== undefined && productionModulePath(name, context.filename) !== undefined) {
            context.report({ node, messageId: 'internalMock', data: { source: name } });
          }
        }
      },
    };
  },
};
