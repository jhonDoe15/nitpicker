const subprocessModules = new Set(['child_process', 'node:child_process', 'execa', 'cross-spawn']);

export default {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      externalExecutable: 'Tests requiring external executables belong in the integration project.',
    },
  },
  create(context) {
    const report = (node, value) => {
      if (subprocessModules.has(value)) context.report({ node, messageId: 'externalExecutable' });
    };
    return {
      ImportDeclaration(node) {
        if (node.importKind !== 'type') report(node, node.source.value);
      },
      ImportExpression(node) {
        report(node, node.source.value);
      },
      CallExpression(node) {
        if (node.callee.type === 'Identifier' && node.callee.name === 'require')
          report(node, node.arguments[0]?.value);
      },
    };
  },
};
