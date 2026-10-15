import { productionModulePath } from '../test-isolation/production-source.mjs';

const EXCEPTION_ROUTE =
  'If injection is not possible, add an exception for nitpicker/no-internal-module-mocks in nitpicker.config.json.';

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
          for (const specifier of node.specifiers) {
            if (
              specifier.type === 'ImportSpecifier' &&
              ['vi', 'vitest'].includes(specifier.imported.name)
            )
              aliases.add(specifier.local.name);
          }
          return;
        }
        if (productionModulePath(node.source.value, context.filename) === undefined) return;
        for (const specifier of node.specifiers) {
          if (specifier.type === 'ImportNamespaceSpecifier') {
            productionNamespaces.set(specifier.local.name, node.source.value);
          }
        }
      },
      CallExpression(node) {
        const callee = node.callee;
        if (
          callee.type !== 'MemberExpression' ||
          callee.computed ||
          !aliases.has(callee.object.name)
        )
          return;
        if (callee.property.name === 'spyOn') {
          const source = productionNamespaces.get(node.arguments[0]?.name);
          if (source !== undefined)
            context.report({ node, messageId: 'internalSpy', data: { source } });
          return;
        }
        if (!['mock', 'doMock'].includes(callee.property.name)) return;
        const target = node.arguments[0];
        const source = target?.type === 'ImportExpression' ? target.source.value : target?.value;
        if (productionModulePath(source, context.filename) === undefined) return;
        context.report({ node, messageId: 'internalMock', data: { source } });
      },
    };
  },
};
