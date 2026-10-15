import { ancestorsOf, variableNamed } from '../../ancestry.mjs';
import { isEffectCallback, isFunctionNode } from '../../react-effects.mjs';

const callbackName = /^on[A-Z]/u;

function isPropBinding(sourceCode, identifier) {
  return (
    variableNamed(sourceCode, identifier)?.defs.some(({ type }) => type === 'Parameter') ?? false
  );
}

function propCallbackName(sourceCode, callee) {
  if (callee.type === 'Identifier') {
    return callbackName.test(callee.name) && isPropBinding(sourceCode, callee)
      ? callee.name
      : undefined;
  }
  const isMember =
    callee.type === 'MemberExpression' &&
    !callee.computed &&
    callee.object.type === 'Identifier' &&
    callbackName.test(callee.property.name) &&
    isPropBinding(sourceCode, callee.object);
  return isMember ? callee.property.name : undefined;
}

function hasDependencies(effectCall) {
  const dependencies = effectCall.arguments[1];
  return dependencies?.type === 'ArrayExpression' && dependencies.elements.length > 0;
}

export const rule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow calling a prop callback from an effect that reacts to a change',
    },
    schema: [],
    messages: {
      effectEvent:
        'Do not call `{{name}}` from an effect to react to a change: call it in the event handler that causes the change (`onSubmit` calls `onSave(value)`). If this effect synchronizes with an external system, add an exception for this rule in nitpicker.config.json.',
    },
  },
  create(context) {
    const sourceCode = context.sourceCode;
    return {
      CallExpression(node) {
        const name = propCallbackName(sourceCode, node.callee);
        const enclosing = ancestorsOf(node).find(isFunctionNode);
        if (
          name !== undefined &&
          enclosing !== undefined &&
          isEffectCallback(sourceCode, enclosing) &&
          hasDependencies(enclosing.parent)
        ) {
          context.report({ node, messageId: 'effectEvent', data: { name } });
        }
      },
    };
  },
};
