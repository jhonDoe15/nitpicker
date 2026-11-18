import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';

function isModuleLevel(declaration: TSESTree.VariableDeclaration): boolean {
  const parent = declaration.parent;
  if (parent.type === AST_NODE_TYPES.Program) {
    return true;
  }
  return (
    parent.type === AST_NODE_TYPES.ExportNamedDeclaration &&
    parent.parent.type === AST_NODE_TYPES.Program
  );
}

export const rule: TSESLint.RuleModule<'moduleLet'> = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Ban module-level let, which is hidden mutable module state',
    },
    schema: [],
    messages: {
      moduleLet:
        "Use 'const' instead of module-level 'let'. Keep state in a parameter or in an object constructed in the composition root and passed in.",
    },
  },
  create(context) {
    return {
      VariableDeclaration(node: TSESTree.VariableDeclaration) {
        if (node.kind === 'let' && isModuleLevel(node)) {
          context.report({ node, messageId: 'moduleLet' });
        }
      },
    };
  },
};
