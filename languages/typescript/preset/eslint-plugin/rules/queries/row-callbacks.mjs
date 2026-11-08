import { ts } from '../../../../typescript-api/typescript-api.mjs';
import { chainOf } from '../analysis/ancestry.mjs';
import { memberName, staticKey, typeServices, unwrapped } from '../security/security-values.mjs';

const FUNCTIONS = new Set(['ArrowFunctionExpression', 'FunctionExpression']);
const FIELD_METHODS = new Set([
  'localeCompare',
  'getTime',
  'valueOf',
  'startsWith',
  'endsWith',
  'includes',
  'toLowerCase',
  'toUpperCase',
]);
const MEMBERSHIP_METHODS = new Set(['includes', 'has']);
const COMPUTED = ts.SymbolFlags.GetAccessor | ts.SymbolFlags.Method;
const SIDE_EFFECTS = new Set(['delete']);

function newState(elements, accumulators) {
  return { elements, accumulators, destructured: new Map(), fields: [], valid: true };
}

function rootOf(member) {
  const chain = chainOf(member, (current) => {
    const object = unwrapped(current.object);
    return object.type === 'MemberExpression' ? object : undefined;
  });
  const first = chain.at(-1);
  const computed = chain.some((current) => current.computed && current.property.type !== 'Literal');
  return { root: unwrapped(first.object), first, computed, chain };
}

function rootField(root, first, state) {
  if (root.type !== 'Identifier') {
    return undefined;
  }
  if (state.destructured.has(root.name)) {
    return state.destructured.get(root.name);
  }
  const name = memberName(first);
  return state.elements.has(root.name) && name !== undefined ? { owner: root, name } : undefined;
}

function isPlainFieldCall(node) {
  const callee = node.type === 'CallExpression' ? unwrapped(node.callee) : undefined;
  return (
    callee?.type === 'MemberExpression' &&
    FIELD_METHODS.has(memberName(callee)) &&
    node.arguments.length === 0
  );
}

function fieldOf(node, state) {
  const target = chainOf(unwrapped(node), (current) =>
    isPlainFieldCall(current) ? unwrapped(unwrapped(current.callee).object) : undefined,
  ).at(-1);
  if (target.type === 'Identifier') {
    return state.destructured.get(target.name);
  }
  if (target.type !== 'MemberExpression') {
    return undefined;
  }
  const { root, first, computed } = rootOf(target);
  return computed ? undefined : rootField(root, first, state);
}

function visitIdentifier(node, state) {
  const field = fieldOf(node, state);
  if (field !== undefined) {
    state.fields.push(field);
  } else if (state.elements.has(node.name)) {
    state.valid = false;
  }
}

function visitComputedKeys(member, state) {
  const { root, chain } = rootOf(member);
  for (const current of chain.filter((step) => step.computed)) {
    visit(current.property, state);
  }
  if (root.type !== 'Identifier') {
    visit(root, state);
  }
}

function visitMember(node, state) {
  const field = fieldOf(node, state);
  const { root } = rootOf(node);
  if (field !== undefined) {
    state.fields.push(field);
  } else if (root.type === 'Identifier' && state.elements.has(root.name)) {
    state.valid = false;
    return;
  }
  visitComputedKeys(node, state);
}

function mentionsElement(node, state) {
  const probe = newState(state.elements, state.accumulators);
  probe.destructured = state.destructured;
  visit(node, probe);
  return probe.fields.length > 0 || !probe.valid;
}

function visitCall(node, state) {
  const callee = unwrapped(node.callee);
  const method = callee.type === 'MemberExpression' ? memberName(callee) : undefined;
  const field = method === undefined ? undefined : fieldOf(callee.object, state);
  if (field !== undefined && FIELD_METHODS.has(method)) {
    state.fields.push(field);
  } else if (MEMBERSHIP_METHODS.has(method) && !mentionsElement(callee.object, state)) {
    visit(callee.object, state);
  } else {
    state.valid = false;
    return;
  }
  visitAll(node.arguments, state);
}

function visitProperty(node, state) {
  if (node.type === 'SpreadElement') {
    visit(node.argument, state);
    return;
  }
  if (node.computed) {
    visit(node.key, state);
  }
  visit(node.value, state);
}

const VISITORS = {
  Literal: () => undefined,
  ThisExpression: () => undefined,
  Identifier: visitIdentifier,
  MemberExpression: visitMember,
  CallExpression: visitCall,
  BinaryExpression: (node, state) => {
    visitAll([node.left, node.right], state);
  },
  LogicalExpression: (node, state) => {
    visitAll([node.left, node.right], state);
  },
  ConditionalExpression: (node, state) => {
    visitAll([node.test, node.consequent, node.alternate], state);
  },
  UnaryExpression: (node, state) => {
    state.valid = state.valid && !SIDE_EFFECTS.has(node.operator);
    visit(node.argument, state);
  },
  TemplateLiteral: (node, state) => {
    visitAll(node.expressions, state);
  },
  ArrayExpression: (node, state) => {
    visitAll(node.elements, state);
  },
  ObjectExpression: (node, state) => {
    for (const property of node.properties) {
      visitProperty(property, state);
    }
  },
  SpreadElement: (node, state) => {
    visit(node.argument, state);
  },
};

function visitAll(nodes, state) {
  for (const node of nodes) {
    visit(node, state);
  }
}

function visit(node, state) {
  const target = unwrapped(node);
  const visitor = Object.hasOwn(VISITORS, target?.type ?? '') ? VISITORS[target.type] : undefined;
  if (visitor === undefined) {
    state.valid = false;
    return;
  }
  visitor(target, state);
}

function bindPattern(pattern, state) {
  if (pattern.type === 'Identifier') {
    state.elements.add(pattern.name);
    return true;
  }
  if (pattern.type !== 'ObjectPattern') {
    return false;
  }
  return pattern.properties.every((property) => {
    const key = staticKey(property);
    const bound = property.type === 'Property' && property.value.type === 'Identifier';
    if (key !== undefined && bound) {
      state.destructured.set(property.value.name, { owner: pattern, name: key });
    }
    return key !== undefined && bound;
  });
}

function returnedExpression(fn) {
  if (fn.body.type !== 'BlockStatement') {
    return fn.body;
  }
  const [only] = fn.body.body;
  return fn.body.body.length === 1 && only.type === 'ReturnStatement'
    ? (only.argument ?? undefined)
    : undefined;
}

function isComputed(services, { owner, name }) {
  const property = services.getTypeAtLocation(owner).getProperty(name);
  return property !== undefined && (property.flags & COMPUTED) !== 0;
}

function readsColumns(context, state) {
  const services = typeServices(context);
  return services === undefined || !state.fields.some((field) => isComputed(services, field));
}

export function readsOnlyFields(context, node, { rows, accumulator = false }) {
  const fn = unwrapped(node);
  if (!FUNCTIONS.has(fn?.type) || fn.async || fn.generator) {
    return false;
  }
  const leading = accumulator ? 1 : 0;
  const accumulators = new Set(accumulator ? [fn.params[0]?.name] : []);
  const state = newState(new Set(), accumulators);
  const rowParams = fn.params.slice(leading);
  const bound =
    fn.params.length === leading + rows && rowParams.every((p) => bindPattern(p, state));
  const body = bound ? returnedExpression(fn) : undefined;
  if (body === undefined || (accumulator && fn.params[0].type !== 'Identifier')) {
    return false;
  }
  visit(body, state);
  return state.valid && state.fields.length > 0 && readsColumns(context, state);
}
