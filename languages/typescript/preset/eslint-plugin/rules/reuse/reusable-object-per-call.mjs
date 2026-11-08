import { ancestorsOf } from '../analysis/ancestry.mjs';
import { findVariable, isFunctionNode, resolveConstant } from '../analysis/constant-resolution.mjs';

const INTL_TYPES = new Set([
  'Collator',
  'DateTimeFormat',
  'DisplayNames',
  'DurationFormat',
  'ListFormat',
  'NumberFormat',
  'PluralRules',
  'RelativeTimeFormat',
  'Segmenter',
]);
const AJV_SOURCE = /^ajv(?:\/|$)/u;
const ONCE_HOSTS = new Set(['useMemo', 'useState', 'once', 'memoize', 'lazy']);
const KEEPING_OPERATORS = new Set(['??=', '||=']);
const ONCE_PLACES = new Set(['PropertyDefinition', 'StaticBlock']);
const MAX_PARTS = 50;

function globalName(context, node, name) {
  if (node.type !== 'Identifier' || node.name !== name) {
    return false;
  }
  const variable = findVariable(context, node, name);
  return variable === undefined || variable.defs.length === 0;
}

function intlType(context, callee) {
  if (
    callee.type !== 'MemberExpression' ||
    callee.computed ||
    callee.property.type !== 'Identifier'
  ) {
    return undefined;
  }
  const owner = callee.object;
  const intl =
    globalName(context, owner, 'Intl') ||
    (owner.type === 'MemberExpression' &&
      !owner.computed &&
      globalName(context, owner.object, 'globalThis') &&
      owner.property.name === 'Intl');
  return intl && INTL_TYPES.has(callee.property.name) ? `Intl.${callee.property.name}` : undefined;
}

function ajvType(context, callee) {
  if (callee.type !== 'Identifier') {
    return undefined;
  }
  const definition = findVariable(context, callee, callee.name)?.defs.at(0);
  const source = definition?.type === 'ImportBinding' ? definition.parent.source.value : '';
  return AJV_SOURCE.test(source) ? callee.name : undefined;
}

function sharedType(context, node) {
  if (node.type === 'NewExpression') {
    return intlType(context, node.callee) ?? ajvType(context, node.callee);
  }
  return intlType(context, node.callee);
}

function parts(node) {
  if (node.type === 'ArrayExpression') {
    return node.elements;
  }
  if (node.type === 'ObjectExpression') {
    return node.properties.map((entry) =>
      entry.type === 'Property' && !entry.computed ? entry.value : undefined,
    );
  }
  if (node.type === 'UnaryExpression') {
    return [node.argument];
  }
  return node.type === 'TemplateLiteral' ? node.expressions : [];
}

function leafConstant(context, node) {
  return (
    node.type === 'Literal' ||
    node.type === 'TemplateLiteral' ||
    node.type === 'ArrayExpression' ||
    node.type === 'ObjectExpression' ||
    node.type === 'UnaryExpression' ||
    globalName(context, node, 'undefined')
  );
}

function constantArguments(context, node) {
  const pending = [...node.arguments];
  for (const current of pending) {
    const value =
      current === undefined || current === null ? undefined : resolveConstant(context, current);
    if (value === undefined || !leafConstant(context, value) || pending.length > MAX_PARTS) {
      return false;
    }
    pending.push(...parts(value));
  }
  return true;
}

function runsOnce(fn) {
  const { parent } = fn;
  return (
    (parent.type === 'MethodDefinition' && parent.kind === 'constructor') ||
    (parent.type === 'CallExpression' &&
      parent.callee.type === 'Identifier' &&
      ONCE_HOSTS.has(parent.callee.name) &&
      parent.arguments.includes(fn))
  );
}

function declaredOutside(context, target, fn) {
  const variable =
    target.type === 'Identifier' ? findVariable(context, target, target.name) : undefined;
  const declaration = variable?.defs.at(0)?.node;
  return declaration !== undefined && !ancestorsOf(declaration).includes(fn) && declaration !== fn;
}

function isStoreCall(node, value) {
  return (
    node.type === 'CallExpression' &&
    node.callee.type === 'MemberExpression' &&
    !node.callee.computed &&
    node.callee.property.name === 'set' &&
    node.arguments.includes(value)
  );
}

function handedOut(node, fn) {
  const { parent } = node;
  if (parent.type === 'ReturnStatement' || (parent === fn && fn.body === node)) {
    return true;
  }
  if (parent.type === 'Property' && parent.value === node) {
    return handedOut(parent.parent, fn);
  }
  return isStoreCall(parent, node);
}

function inReturnedFunction(identifier, fn) {
  return ancestorsOf(identifier).some(
    (ancestor) => isFunctionNode(ancestor) && ancestor !== fn && handedOut(ancestor, fn),
  );
}

function escapes(context, target, fn) {
  const variable =
    target.type === 'Identifier' ? findVariable(context, target, target.name) : undefined;
  return (variable?.references ?? []).some(
    ({ identifier }) => handedOut(identifier, fn) || inReturnedFunction(identifier, fn),
  );
}

function kept(context, node, fn) {
  const { parent } = node;
  if (handedOut(node, fn)) {
    return true;
  }
  if (parent.type === 'VariableDeclarator' && parent.init === node) {
    return escapes(context, parent.id, fn);
  }
  if (parent.type === 'AssignmentExpression' && parent.right === node) {
    return (
      KEEPING_OPERATORS.has(parent.operator) ||
      parent.left.type === 'MemberExpression' ||
      declaredOutside(context, parent.left, fn) ||
      escapes(context, parent.left, fn)
    );
  }
  return false;
}

function isIife(fn) {
  return fn.parent.type === 'CallExpression' && fn.parent.callee === fn;
}

function enclosingFunction(node) {
  const place = ancestorsOf(node).find(
    (ancestor) => ONCE_PLACES.has(ancestor.type) || (isFunctionNode(ancestor) && !isIife(ancestor)),
  );
  return place !== undefined && isFunctionNode(place) ? place : undefined;
}

function perCall(context, node) {
  const fn = enclosingFunction(node);
  return fn !== undefined && !runsOnce(fn) && !kept(context, node, fn);
}

export const rule = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Disallow building an Intl formatter or an Ajv instance with fixed options on every call',
      requiresTypeChecking: false,
    },
    schema: [],
    messages: {
      perCall:
        'Build `{{ type }}` once and reuse it: with fixed options it is safe to share, and building it loads locale data or compiles schemas on every call. Keep it in a module-level constant or a class field, or cache it by the value that varies.',
    },
  },
  create(context) {
    function check(node) {
      const type = sharedType(context, node);
      if (type !== undefined && constantArguments(context, node) && perCall(context, node)) {
        context.report({ node, messageId: 'perCall', data: { type } });
      }
    }
    return { NewExpression: check, CallExpression: check };
  },
};
