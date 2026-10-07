import path from 'node:path';

const EXPLICIT_INFRASTRUCTURE_SEAM = /(?:^|[/.-])(?:fixtures?|infrastructure|seams?)(?:[/.-]|$)/;

function isRuntimeImport(node) {
  return (
    node.importKind !== 'type' &&
    (node.specifiers.length === 0 ||
      node.specifiers.some((specifier) => specifier.importKind !== 'type'))
  );
}

function isProductionModule(filename, source) {
  if (!source.startsWith('.')) {
    return source.includes('/src/main/');
  }
  const resolved = path.resolve(path.dirname(filename), source).replaceAll('\\', '/');
  return resolved.includes('/src/main/') && !/(?:__tests__|\.test\.|\.spec\.)/.test(resolved);
}

function mockedSource(node) {
  if (
    node.callee.type !== 'MemberExpression' ||
    node.callee.computed ||
    node.callee.object.type !== 'Identifier' ||
    node.callee.object.name !== 'vi' ||
    node.callee.property.type !== 'Identifier' ||
    !['mock', 'doMock'].includes(node.callee.property.name)
  ) {
    return undefined;
  }
  const [firstArgument] = node.arguments;
  return firstArgument?.type === 'Literal' && typeof firstArgument.value === 'string'
    ? firstArgument.value
    : undefined;
}

export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'Prevent a test from mocking the production module it imports as its subject',
    },
    schema: [],
    messages: {
      mockedSubject: 'Do not mock the production subject {{source}}.',
    },
  },
  create(context) {
    const filename = context.filename.replaceAll('\\', '/');
    const productionImports = new Set();
    const mocks = [];

    return {
      ImportDeclaration(node) {
        const source = node.source.value;
        if (
          typeof source === 'string' &&
          isRuntimeImport(node) &&
          isProductionModule(filename, source) &&
          !EXPLICIT_INFRASTRUCTURE_SEAM.test(source)
        ) {
          productionImports.add(source);
        }
      },
      CallExpression(node) {
        const source = mockedSource(node);
        if (source !== undefined) {
          mocks.push({ node, source });
        }
      },
      'Program:exit'() {
        for (const mock of mocks) {
          if (productionImports.has(mock.source)) {
            context.report({
              node: mock.node,
              messageId: 'mockedSubject',
              data: { source: mock.source },
            });
          }
        }
      },
    };
  },
};
