import { ancestorsOf, scopeChain } from '../analysis/ancestry.mjs';
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

export const rule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow a function that calls itself',
    },
    schema: [],
    messages: {
      recursion:
        "'{{name}}' calls itself. Retry or poll: loop with for...of over attempt numbers. Tree walk (directories, AST, JSON): for...of over a worklist, pushing each node's children onto it (for (const node of pending) { pending.push(...children) }). Flat data: map, filter, flatMap or Object.fromEntries. domain/ has no loops, so there use map or flatMap, or do the walk in adapters/.",
    },
  },
  create(context) {
    const sourceCode = context.sourceCode;

    function resolve(identifier) {
      for (const scope of scopeChain(sourceCode.getScope(identifier))) {
        const variable = scope.set.get(identifier.name);
        if (variable) return variable;
      }
      return undefined;
    }

    function enclosingFunctions(node) {
      return ancestorsOf(node).filter((current) => functionTypes.has(current.type));
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
