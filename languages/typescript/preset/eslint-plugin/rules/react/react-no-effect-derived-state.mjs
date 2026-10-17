import { variableNamed } from '../analysis/ancestry.mjs';
import { enclosingFunction, hookName, isEffectCallback } from './react-effects.mjs';

const SETTER_INDEX = 1;
const storageNames = new Set(['localStorage', 'sessionStorage']);
const globalObjects = new Set(['window', 'globalThis', 'self']);

function runsOnce(effectCall) {
  const dependencies = effectCall.arguments[1];
  return dependencies?.type === 'ArrayExpression' && dependencies.elements.length === 0;
}

function declaredName(fn) {
  if (fn.type === 'FunctionDeclaration') {
    return fn.id ?? undefined;
  }
  const declarator = fn.parent;
  return declarator.type === 'VariableDeclarator' &&
    declarator.init === fn &&
    declarator.id.type === 'Identifier'
    ? declarator.id
    : undefined;
}

function isUseStateCall(sourceCode, node) {
  return node?.type === 'CallExpression' && hookName(sourceCode, node.callee) === 'useState';
}

function isStateTuple(sourceCode, identifier) {
  return (
    variableNamed(sourceCode, identifier)?.defs.some(
      ({ node }) => node.type === 'VariableDeclarator' && isUseStateCall(sourceCode, node.init),
    ) ?? false
  );
}

function isSetterIndexAccess(sourceCode, init) {
  return (
    init?.type === 'MemberExpression' &&
    init.computed &&
    init.property.type === 'Literal' &&
    init.property.value === SETTER_INDEX &&
    init.object.type === 'Identifier' &&
    isStateTuple(sourceCode, init.object)
  );
}

function isStateSetterDefinition(sourceCode, definition) {
  const declarator = definition.node;
  if (declarator.type !== 'VariableDeclarator') {
    return false;
  }
  if (declarator.id.type === 'ArrayPattern') {
    return (
      declarator.id.elements[SETTER_INDEX] === definition.name &&
      isUseStateCall(sourceCode, declarator.init)
    );
  }
  return isSetterIndexAccess(sourceCode, declarator.init);
}

function isStateSetterCall(sourceCode, node) {
  return (
    node.callee.type === 'Identifier' &&
    (variableNamed(sourceCode, node.callee)?.defs.some((definition) =>
      isStateSetterDefinition(sourceCode, definition),
    ) ??
      false)
  );
}

function isCalledSynchronouslyIn(sourceCode, fn, effect) {
  const name = declaredName(fn);
  const variable = name === undefined ? undefined : variableNamed(sourceCode, name);
  return (
    variable?.references.some(
      ({ identifier }) =>
        identifier.parent.type === 'CallExpression' &&
        identifier.parent.callee === identifier &&
        enclosingFunction(identifier.parent) === effect,
    ) ?? false
  );
}

function owningEffect(sourceCode, fn) {
  if (isEffectCallback(sourceCode, fn)) {
    return fn;
  }
  const outer = fn.async || fn.generator ? undefined : enclosingFunction(fn);
  return outer !== undefined &&
    isEffectCallback(sourceCode, outer) &&
    isCalledSynchronouslyIn(sourceCode, fn, outer)
    ? outer
    : undefined;
}

function isFixedValue(node) {
  switch (node?.type) {
    case 'Literal':
      return true;
    case 'TemplateLiteral':
      return node.expressions.length === 0;
    case 'ArrayExpression':
      return node.elements.length === 0;
    case 'ObjectExpression':
      return node.properties.length === 0;
    case 'Identifier':
      return node.name === 'undefined';
    case 'UnaryExpression':
      return node.argument.type === 'Literal';
    default:
      return false;
  }
}

function isStorage(sourceCode, node) {
  if (node.type === 'Identifier') {
    return storageNames.has(node.name) && (variableNamed(sourceCode, node)?.defs.length ?? 0) === 0;
  }
  return (
    node.type === 'MemberExpression' &&
    !node.computed &&
    storageNames.has(node.property.name) &&
    node.object.type === 'Identifier' &&
    globalObjects.has(node.object.name)
  );
}

function readsStorage(sourceCode, root) {
  const pending = root === undefined ? [] : [root];
  for (const node of pending) {
    if (isStorage(sourceCode, node)) {
      return true;
    }
    pending.push(
      ...Object.entries(node)
        .filter(([field]) => field !== 'parent')
        .flatMap(([, value]) => [value].flat())
        .filter((value) => typeof value?.type === 'string'),
    );
  }
  return false;
}

function messageIdFor(sourceCode, call, effectCall) {
  const [value] = call.arguments;
  if (readsStorage(sourceCode, value)) {
    return 'storageState';
  }
  const hasDependencyList = effectCall.arguments[1]?.type === 'ArrayExpression';
  return hasDependencyList && isFixedValue(value) ? 'resetState' : 'derivedState';
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
        'Do not set state from an effect to mirror props or state. Compute the value during render (`const total = price * quantity;`). If this effect synchronizes with an external system, add an exception for this rule in nitpicker.config.json.',
      resetState:
        'Do not reset state from an effect when a prop changes: render the component with that prop as its `key` (`<Form key={userId} />`), so React starts it with fresh state. If this effect synchronizes with an external system, add an exception for this rule in nitpicker.config.json.',
      storageState:
        'Do not copy browser storage into state from an effect: read it during render with `useSyncExternalStore(subscribe, () => localStorage.getItem(key))`, which also follows changes from other tabs. If this effect synchronizes with an external system, add an exception for this rule in nitpicker.config.json.',
    },
  },
  create(context) {
    const sourceCode = context.sourceCode;
    return {
      CallExpression(node) {
        if (!isStateSetterCall(sourceCode, node)) {
          return;
        }
        const fn = enclosingFunction(node);
        const effect = fn === undefined ? undefined : owningEffect(sourceCode, fn);
        if (effect !== undefined && !runsOnce(effect.parent)) {
          context.report({ node, messageId: messageIdFor(sourceCode, node, effect.parent) });
        }
      },
    };
  },
};
