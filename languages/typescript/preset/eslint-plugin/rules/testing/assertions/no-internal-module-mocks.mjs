import { productionModulePath } from '../../../test-isolation/production-source.mjs';
import { moduleMocks } from '../runners/module-mocks.mjs';
import { createRunnerApis, runnerApiVisitors } from '../runners/runner-apis.mjs';
import { spiedMember } from '../runners/runner-doubles.mjs';

const EXCEPTION_ROUTE = 'An exception fits only when injection is not possible.';

function trackNamespaces(namespaces, node) {
  for (const specifier of node.specifiers) {
    if (specifier.type === 'ImportNamespaceSpecifier') {
      namespaces.set(specifier.local.name, node.source.value);
    }
  }
}

export const rule = {
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
    const productionNamespaces = new Map();
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
          const source = productionNamespaces.get(spied.target.name);
          if (source !== undefined) {
            context.report({ node, messageId: 'internalSpy', data: { source } });
          }
          return;
        }
        for (const { name } of moduleMocks(apis, node)) {
          if (productionModulePath(name, context.filename) !== undefined) {
            context.report({ node, messageId: 'internalMock', data: { source: name } });
          }
        }
      },
    };
  },
};
