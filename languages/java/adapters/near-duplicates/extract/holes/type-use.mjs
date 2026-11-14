import { METHOD, descendants, field, roleOf, squashed } from '../syntax.mjs';

const DIRECT = 'direct';
const CONTEXT = 'a differing type is used where a type parameter cannot stand for it';
const VALUES = 'the code uses a value of the differing type in a way a type parameter cannot cover';
const DECLARED_BY = new Set([
  'formal_parameter',
  'local_variable_declaration',
  'enhanced_for_statement',
]);
const SINKS = new Set([
  'add',
  'addAll',
  'put',
  'putAll',
  'offer',
  'push',
  'contains',
  'containsKey',
  'set',
]);
const RESULTING = new Set(['put', 'set', 'push']);
const NEUTRAL = new Set(['size', 'isEmpty', 'clear']);
const SOURCES = new Set([
  'get',
  'getFirst',
  'getLast',
  'getKey',
  'getValue',
  'entrySet',
  'keySet',
  'values',
  'remove',
  'poll',
  'peek',
  'pop',
  'element',
]);

function typePosition(node) {
  const chain = [node];
  let nested = false;
  for (const current of chain) {
    const { parent } = current;
    if (parent.type === 'type_arguments') {
      nested = true;
      chain.push(parent.parent.type === 'generic_type' ? parent.parent : parent);
    } else if (parent.type === 'array_type') {
      chain.push(parent);
    } else {
      return { nested, parent, current };
    }
  }
  return undefined;
}

function isTypeOf(parent, current) {
  return field(parent, 'type')?.id === current.id;
}

function contextProblem(node) {
  const { nested, parent, current } = typePosition(node);
  if (nested) {
    return parent.type === 'class_literal' ? CONTEXT : undefined;
  }
  const declares = [...DECLARED_BY, METHOD].includes(parent.type) && isTypeOf(parent, current);
  return declares ? undefined : CONTEXT;
}

function holeIds(typeHoles) {
  return new Set(typeHoles.flatMap(({ occurrences }) => occurrences.map(({ a }) => a.id)));
}

function containsHole(typeNode, ids) {
  return descendants(typeNode).some((part) => ids.has(part.id));
}

function declaredNames(declaration) {
  const names = [];
  if (declaration.type === 'formal_parameter' || declaration.type === 'enhanced_for_statement') {
    names.push(field(declaration, 'name'));
  } else {
    names.push(
      ...declaration.namedChildren
        .filter(({ type }) => type === 'variable_declarator')
        .map((declarator) => field(declarator, 'name')),
    );
  }
  return names.map(({ text }) => text);
}

function taintKind(declaration, ids) {
  const type = field(declaration, 'type');
  if (type === undefined || !containsHole(type, ids)) {
    return undefined;
  }
  return ids.has(type.id) || type.type === 'array_type' ? DIRECT : 'container';
}

function taintedNames(method, ids) {
  const tainted = new Map();
  for (const declaration of descendants(method).filter(({ type }) => DECLARED_BY.has(type))) {
    const kind = taintKind(declaration, ids);
    for (const name of kind === undefined ? [] : declaredNames(declaration)) {
      tainted.set(name, kind);
    }
  }
  return tainted;
}

function readsTainted(declaration, tainted) {
  return descendants(declaration).some(
    (part) => part.type === 'identifier' && tainted.has(part.text),
  );
}

function propagateInferred(method, tainted) {
  const inferred = descendants(method).filter(
    (node) => node.type === 'local_variable_declaration' && squashed(field(node, 'type')) === 'var',
  );
  for (const declaration of inferred) {
    if (!readsTainted(declaration, tainted)) {
      continue;
    }
    for (const name of declaredNames(declaration)) {
      tainted.set(name, DIRECT);
    }
  }
}

function isSinkArgument(expression, tainted) {
  const list = expression.parent;
  const call = list.type === 'argument_list' ? list.parent : undefined;
  const receiver = call?.type === 'method_invocation' ? field(call, 'object') : undefined;
  return (
    receiver !== undefined &&
    tainted.get(receiver.text) === 'container' &&
    SINKS.has(field(call, 'name').text)
  );
}

function isPlainUse(expression, tainted) {
  const { parent } = expression;
  const checks = {
    variable_declarator: () => field(parent, 'value')?.id === expression.id,
    assignment_expression: () => true,
    return_statement: () => true,
    expression_statement: () => true,
    enhanced_for_statement: () => field(parent, 'value')?.id === expression.id,
    binary_expression: () => ['==', '!='].includes(field(parent, 'operator').text),
    argument_list: () => isSinkArgument(expression, tainted),
  };
  return checks[parent.type]?.() === true;
}

function useProblem(node, tainted) {
  const parent = node.parent;
  const isReceiver = parent.type === 'method_invocation' && field(parent, 'object')?.id === node.id;
  if (!isReceiver) {
    return isPlainUse(node, tainted) ? undefined : VALUES;
  }
  const name = field(parent, 'name').text;
  if (tainted.get(node.text) === DIRECT) {
    return VALUES;
  }
  if (NEUTRAL.has(name)) {
    return undefined;
  }
  if (SINKS.has(name)) {
    return RESULTING.has(name) && !isPlainUse(parent, tainted) ? VALUES : undefined;
  }
  return SOURCES.has(name) && isPlainUse(parent, tainted) ? undefined : VALUES;
}

export function typeUseProblem(method, typeHoles) {
  if (typeHoles.length === 0) {
    return undefined;
  }
  const occurrences = typeHoles.flatMap((hole) => hole.occurrences.map(({ a }) => a));
  const context = occurrences.map(contextProblem).find((found) => found !== undefined);
  if (context !== undefined) {
    return context;
  }
  const tainted = taintedNames(method, holeIds(typeHoles));
  propagateInferred(method, tainted);
  return descendants(field(method, 'body'))
    .filter(
      (node) =>
        node.type === 'identifier' && tainted.has(node.text) && roleOf(node) === 'reference',
    )
    .map((node) => useProblem(node, tainted))
    .find((found) => found !== undefined);
}
