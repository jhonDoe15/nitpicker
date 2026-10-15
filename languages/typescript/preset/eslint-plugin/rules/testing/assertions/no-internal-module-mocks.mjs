import path from 'node:path';
import { readLayout } from '../../../../head-policy.mjs';

const layout = readLayout();

export const rule = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      internalMock:
        'Inject the dependency instead of replacing internal production module {{source}}.',
    },
  },
  create(context) {
    const aliases = new Set(['vi', 'vitest']);
    return {
      ImportDeclaration(node) {
        if (node.source.value !== 'vitest') return;
        for (const specifier of node.specifiers) {
          if (
            specifier.type === 'ImportSpecifier' &&
            ['vi', 'vitest'].includes(specifier.imported.name)
          )
            aliases.add(specifier.local.name);
        }
      },
      CallExpression(node) {
        const callee = node.callee;
        if (
          callee.type !== 'MemberExpression' ||
          callee.computed ||
          !aliases.has(callee.object.name) ||
          !['mock', 'doMock'].includes(callee.property.name)
        )
          return;
        const target = node.arguments[0];
        const source = target?.type === 'ImportExpression' ? target.source.value : target?.value;
        if (typeof source !== 'string') return;
        const resolved = source.startsWith('.')
          ? path.resolve(path.dirname(context.filename), source).replaceAll('\\\\', '/')
          : source;
        const sourceRoot = layout.sourceRootOf(resolved);
        if (
          sourceRoot === undefined ||
          layout.isTestFile(resolved.slice(resolved.indexOf(`/${sourceRoot}/`) + 1))
        )
          return;
        context.report({ node, messageId: 'internalMock', data: { source } });
      },
    };
  },
};
