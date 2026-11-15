import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { callbackOwner, enclosingFunction, isSuiteCall } from './test-calls.mts';

function declaresSharedState(declaration: TSESTree.VariableDeclaration): boolean {
  if (declaration.kind !== 'let') {
    return false;
  }
  const owner = enclosingFunction(declaration);
  if (owner === undefined) {
    return true;
  }
  const call = callbackOwner(owner);
  return (
    call !== undefined && isSuiteCall(call) && 'body' in owner && owner.body === declaration.parent
  );
}

function isTopLevelOrSuiteLevel(declaration: TSESTree.VariableDeclaration): boolean {
  const parent = declaration.parent;
  return (
    parent.type === AST_NODE_TYPES.Program ||
    parent.type === AST_NODE_TYPES.ExportNamedDeclaration ||
    (parent.type === AST_NODE_TYPES.BlockStatement && declaresSharedState(declaration))
  );
}

export const rule: TSESLint.RuleModule<'sharedState'> = {
  meta: {
    type: 'problem',
    docs: { description: 'Ban initialised let state shared by the tests of a file' },
    schema: [],
    messages: {
      sharedState:
        'Shared mutable state makes tests depend on their order. Keep `{{name}}` inside the test, or declare it without a value and set it in `beforeEach`.',
    },
  },
  create(context) {
    return {
      VariableDeclaration(node) {
        if (node.kind !== 'let' || !isTopLevelOrSuiteLevel(node)) {
          return;
        }
        for (const declarator of node.declarations) {
          if (declarator.init === null || declarator.id.type !== AST_NODE_TYPES.Identifier) {
            continue;
          }
          context.report({
            node: declarator,
            messageId: 'sharedState',
            data: { name: declarator.id.name },
          });
        }
      },
    };
  },
};
