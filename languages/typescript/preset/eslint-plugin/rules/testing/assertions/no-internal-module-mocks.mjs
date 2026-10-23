import { productionModulePath } from '../../../test-isolation/production-source.mjs';
import { mockedModuleSource } from '../../analysis/test-code-analysis.mjs';

const EXCEPTION_ROUTE = 'An exception fits only when injection is not possible.';

function isVitestAlias(specifier) {
  return specifier.type === 'ImportSpecifier' && ['vi', 'vitest'].includes(specifier.imported.name);
}

function trackVitestAliases(aliases, node) {
  for (const specifier of node.specifiers.filter(isVitestAlias)) {
    aliases.add(specifier.local.name);
  }
}

function trackNamespaces(namespaces, node) {
  for (const specifier of node.specifiers) {
    if (specifier.type === 'ImportNamespaceSpecifier') {
      namespaces.set(specifier.local.name, node.source.value);
    }
  }
}

function isVitestMember(aliases, callee) {
  return callee.type === 'MemberExpression' && !callee.computed && aliases.has(callee.object.name);
}

export const rule = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      internalMock: `Inject the dependency instead of replacing internal production module {{source}}. ${EXCEPTION_ROUTE}`,
      internalSpy: `Inject the dependency instead of replacing a function of internal production module {{source}} with \`vi.spyOn\`. ${EXCEPTION_ROUTE}`,
    },
  },
  create(context) {
    const aliases = new Set(['vi', 'vitest']);
    const productionNamespaces = new Map();
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
          const source = productionNamespaces.get(node.arguments[0]?.name);
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
