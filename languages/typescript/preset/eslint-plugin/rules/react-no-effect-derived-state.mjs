import { ancestorsOf } from './ancestry.mjs';
import { hookName, isEffectCallback, isFunctionNode } from './react-effects.mjs';

function isStateSetterDefinition(definition) {
  const declarator = definition.node;
  return (
    declarator.type === 'VariableDeclarator' &&
    declarator.id.type === 'ArrayPattern' &&
    declarator.id.elements[1] === definition.name &&
    declarator.init?.type === 'CallExpression' &&
    hookName(declarator.init.callee) === 'useState'
  );
}

function runsOnce(effectCall) {
  const dependencies = effectCall.arguments[1];
  return dependencies?.type === 'ArrayExpression' && dependencies.elements.length === 0;
}

export const rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow setting state from an effect body, which derives state from props or state',
    },
    schema: [],
    messages: {
      derivedState:
        'Do not set state from an effect to mirror props or state. Compute the value during render (`const total = price * quantity;`, wrapped in `useMemo` if it is costly), or reset state by giving the component a `key`. If this effect synchronizes with an external system (measuring the DOM in `useLayoutEffect`), add an exception for this rule in nitpicker.config.json.',
    },
  },
  create(context) {
    const sourceCode = context.sourceCode;

    function isStateSetterCall(node) {
      if (node.callee.type !== 'Identifier') {
        return false;
      }
      const reference = sourceCode
        .getScope(node)
        .references.find(({ identifier }) => identifier === node.callee);
      return reference?.resolved?.defs.some(isStateSetterDefinition) ?? false;
    }

    return {
      CallExpression(node) {
        if (!isStateSetterCall(node)) {
          return;
        }
        const effect = ancestorsOf(node).find(isFunctionNode);
        if (effect !== undefined && isEffectCallback(effect) && !runsOnce(effect.parent)) {
          context.report({ node, messageId: 'derivedState' });
        }
      },
    };
  },
};
