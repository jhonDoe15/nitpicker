function isModuleLevel(declaration) {
  const parent = declaration.parent;
  if (parent.type === 'Program') {
    return true;
  }
  return parent.type === 'ExportNamedDeclaration' && parent.parent.type === 'Program';
}

export const rule = {
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
      VariableDeclaration(node) {
        if (node.kind === 'let' && isModuleLevel(node)) {
          context.report({ node, messageId: 'moduleLet' });
        }
      },
    };
  },
};
