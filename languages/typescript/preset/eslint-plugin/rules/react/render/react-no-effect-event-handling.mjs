import { ancestorsOf, constantInitializer, variableNamed } from '../../analysis/ancestry.mjs';
import { hookName, isEffectCallback, isFunctionNode } from '../react-effects.mjs';

const callbackName = /^on[A-Z]/u;
const hookFunctionName = /^use[A-Z0-9]/u;

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

function propDefinition(sourceCode, identifier) {
  return variableNamed(sourceCode, identifier)?.defs.find((candidate) =>
    isPropDefinition(sourceCode, candidate),
  );
}

function functionName(fn) {
  if (fn.id) {
    return fn.id.name;
  }
  return fn.parent.type === 'VariableDeclarator' && fn.parent.id.type === 'Identifier'
    ? fn.parent.id.name
    : undefined;
}

function ownerFunction(sourceCode, definition) {
  if (definition.type === 'Parameter') {
    return definition.node;
  }
  return variableNamed(sourceCode, definition.node.init)?.defs.at(0)?.node;
}

function isHookInput(sourceCode, definition) {
  const owner = ownerFunction(sourceCode, definition);
  return owner !== undefined && hookFunctionName.test(functionName(owner) ?? '');
}

function isCallbackProp(sourceCode, definition) {
  return (
    callbackName.test(destructuredKey(definition.name)) || !isHookInput(sourceCode, definition)
  );
}

function memberCallbackName(sourceCode, callee) {
  const isMember =
    callee.type === 'MemberExpression' &&
    !callee.computed &&
    callee.object.type === 'Identifier' &&
    callbackName.test(callee.property.name) &&
    propDefinition(sourceCode, callee.object) !== undefined;
  return isMember ? callee.property.name : undefined;
}

function heldCallback(sourceCode, callee) {
  const isRefCall =
    callee.type === 'MemberExpression' &&
    !callee.computed &&
    callee.property.name === 'current' &&
    callee.object.type === 'Identifier';
  const init = isRefCall ? constantInitializer(sourceCode, callee.object) : undefined;
  const isRef =
    init?.type === 'CallExpression' &&
    hookName(sourceCode, init.callee) === 'useRef' &&
    init.arguments.length === 1 &&
    init.arguments[0].type !== 'SpreadElement';
  return isRef ? init.arguments[0] : undefined;
}

function propCallbackName(sourceCode, callee) {
  if (callee.type === 'Identifier') {
    const definition = propDefinition(sourceCode, callee);
    return definition !== undefined && isCallbackProp(sourceCode, definition)
      ? callee.name
      : undefined;
  }
  return memberCallbackName(sourceCode, callee);
}

function calledCallbackName(sourceCode, callee) {
  const held = heldCallback(sourceCode, callee);
  return held === undefined
    ? propCallbackName(sourceCode, callee)
    : propCallbackName(sourceCode, held);
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
        const name = calledCallbackName(sourceCode, node.callee);
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
