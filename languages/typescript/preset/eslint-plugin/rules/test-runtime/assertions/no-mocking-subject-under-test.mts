import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import path from 'node:path';
import { moduleMocks } from '../../runner-apis/module-mocks.mts';
import { createRunnerApis, runnerApiVisitors } from '../../runner-apis/runner-apis.mts';
import { readLayout } from '../../typed/policy-views.mts';

const layout = readLayout();

const EXPLICIT_INFRASTRUCTURE_SEAM = /(?:^|[/.-])(?:fixtures?|infrastructure|seams?)(?:[/.-]|$)/;

function isRuntimeImport(node: TSESTree.ImportDeclaration): boolean {
  return (
    node.importKind !== 'type' &&
    (node.specifiers.length === 0 ||
      node.specifiers.some(
        (specifier) =>
          specifier.type !== AST_NODE_TYPES.ImportSpecifier || specifier.importKind !== 'type',
      ))
  );
}

function isProductionModule(filename: string, source: string): boolean {
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

export const rule: TSESLint.RuleModule<'mockedSubject'> = {
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
    const productionImports = new Set<string>();
    const mocks: { readonly node: TSESTree.CallExpression; readonly source: string }[] = [];
    const apis = createRunnerApis();
    const apiVisitors = runnerApiVisitors(apis);

    return {
      ...apiVisitors,
      ImportDeclaration(node) {
        apiVisitors.ImportDeclaration(node);
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
        for (const { name } of moduleMocks(apis, node)) {
          if (name !== undefined) {
            mocks.push({ node, source: name });
          }
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
