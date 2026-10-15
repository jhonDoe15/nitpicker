import path from 'node:path';
import { readLayout } from '../../head-policy.mjs';
import {
  createMockAliases,
  isModuleMockCall,
  recordMockImport,
} from './test-runner/module-mocks.mjs';

const layout = readLayout();

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
    return layout.sourceRootOf(source) !== undefined;
  }
  const resolved = path.resolve(path.dirname(filename), source).replaceAll('\\', '/');
  const sourceRoot = layout.sourceRootOf(resolved);
  return (
    sourceRoot !== undefined &&
    !layout.isTestFile(resolved.slice(resolved.indexOf(`/${sourceRoot}/`) + 1))
  );
}

function mockedSource(node, aliases) {
  if (!isModuleMockCall(node, aliases)) {
    return undefined;
  }
  const [firstArgument] = node.arguments;
  return firstArgument?.type === 'Literal' && typeof firstArgument.value === 'string'
    ? firstArgument.value
    : undefined;
}

export const rule = {
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
    const aliases = createMockAliases();

    return {
      ImportDeclaration(node) {
        recordMockImport(node, aliases);
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
        const source = mockedSource(node, aliases);
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
