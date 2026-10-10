const functionTypes = new Set([
  'FunctionDeclaration',
  'FunctionExpression',
  'ArrowFunctionExpression',
]);

function declaredBindingNode(fn) {
  if (fn.id) return fn.id;
  const parent = fn.parent;
  if (
    parent.type === 'VariableDeclarator' &&
    parent.init === fn &&
    parent.id.type === 'Identifier'
  ) {
    return parent.id;
  }
  return undefined;
}

export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow a function that calls itself',
    },
    schema: [],
    messages: {
      recursion:
        "'{{name}}' calls itself. Replace recursion with map, filter, flatMap, or Object.fromEntries over the data.",
    },
  },
  create(context) {
    const sourceCode = context.sourceCode;

    function resolve(identifier) {
      for (let scope = sourceCode.getScope(identifier); scope; scope = scope.upper) {
        const variable = scope.set.get(identifier.name);
        if (variable) return variable;
      }
      return undefined;
    }

    function enclosingFunctions(node) {
      const found = [];
      for (let current = node.parent; current; current = current.parent) {
        if (functionTypes.has(current.type)) found.push(current);
      }
      return found;
    }

    return {
      CallExpression(node) {
        if (node.callee.type !== 'Identifier') return;
        const variable = resolve(node.callee);
        if (!variable) return;
        const recursive = enclosingFunctions(node).some((fn) => {
          const binding = declaredBindingNode(fn);
          return binding !== undefined && variable.identifiers.includes(binding);
        });
        if (recursive) {
          context.report({ node, messageId: 'recursion', data: { name: node.callee.name } });
        }
      },
    };
  },
};
