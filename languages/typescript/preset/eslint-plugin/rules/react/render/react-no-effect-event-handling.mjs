import { ancestorsOf, variableNamed } from '../../analysis/ancestry.mjs';
import { isEffectCallback, isFunctionNode } from '../react-effects.mjs';

const callbackName = /^on[A-Z]/u;

function isParameter(sourceCode, identifier) {
  return (
    variableNamed(sourceCode, identifier)?.defs.some(({ type }) => type === 'Parameter') ?? false
  );
}

function isDestructuredFromParameter(sourceCode, { type, node }) {
  return (
    type === 'Variable' &&
    node.id.type === 'ObjectPattern' &&
    node.init?.type === 'Identifier' &&
    isParameter(sourceCode, node.init)
  );
}

function isPropDefinition(sourceCode, definition) {
  return definition.type === 'Parameter' || isDestructuredFromParameter(sourceCode, definition);
}

function destructuredKey(binding) {
  const target = binding.parent.type === 'AssignmentPattern' ? binding.parent : binding;
  const property = target.parent;
  const isRenamed =
    property.type === 'Property' &&
    property.value === target &&
    !property.computed &&
    property.key.type === 'Identifier';
  return isRenamed ? property.key.name : binding.name;
}

function propName(sourceCode, identifier) {
  const definition = variableNamed(sourceCode, identifier)?.defs.find((candidate) =>
    isPropDefinition(sourceCode, candidate),
  );
  return definition === undefined ? undefined : destructuredKey(definition.name);
}

function propCallbackName(sourceCode, callee) {
  if (callee.type === 'Identifier') {
    const name = propName(sourceCode, callee);
    return name !== undefined && callbackName.test(name) ? callee.name : undefined;
  }
  const isMember =
    callee.type === 'MemberExpression' &&
    !callee.computed &&
    callee.object.type === 'Identifier' &&
    callbackName.test(callee.property.name) &&
    propName(sourceCode, callee.object) !== undefined;
  return isMember ? callee.property.name : undefined;
}

function runsOnlyOnMount(effectCall) {
  const dependencies = effectCall.arguments[1];
  return dependencies?.type === 'ArrayExpression' && dependencies.elements.length === 0;
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
          !runsOnlyOnMount(enclosing.parent)
        ) {
          context.report({ node, messageId: 'effectEvent', data: { name } });
        }
      },
    };
  },
};
