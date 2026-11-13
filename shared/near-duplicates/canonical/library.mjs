import { NONE, categoryOf, make, rebuild } from '../tree/nodes.mjs';

const EXPRESSION_KIND = 'expression';

const MATCHES = new Map([
  ['anyMatch', 'any'],
  ['some', 'any'],
  ['any', 'any'],
  ['allMatch', 'all'],
  ['every', 'all'],
  ['all', 'all'],
  ['noneMatch', 'none'],
  ['none', 'none'],
]);
const CHARACTER_VIEWS = new Set(['chars', 'toCharArray']);
const REFERENCE = /^(?:method_reference|reference):(?<owner>[\w.]+)::(?<method>\w+)$/u;
const IMPLICIT_PARAMETER = 'it';
const GENERATORS = new Set(['generator', 'list-comprehension']);
const LOGICAL = new Set(['&&', '||']);

function isBooleanLiteral(node, value) {
  return node?.kind === 'literal' && node.literal === 'boolean' && node.value === value;
}

function negated(node) {
  if (node.kind === 'unary' && node.value === '!') {
    return node.children[0];
  }
  return make('unary', [node], { value: '!' });
}

function isMember(node, names) {
  return node?.kind === 'member' && names.has(node.value);
}

function iterableOf(receiver) {
  if (receiver.kind !== 'call') {
    return receiver;
  }
  const [callee, ...rest] = receiver.children;
  if (isMember(callee, new Set(['stream'])) && rest.length === 0) {
    return callee.children[0];
  }
  if (isMember(callee, new Set(['stream'])) && rest.length === 1) {
    return rest[0];
  }
  if (isMember(callee, CHARACTER_VIEWS) && rest.length === 0) {
    return make(EXPRESSION_KIND, [callee.children[0]], { value: 'characters' });
  }
  return receiver;
}

function returnedValue(body) {
  if (categoryOf(body) === EXPRESSION_KIND) {
    return body;
  }
  const [only] = body.children;
  return body.children.length === 1 && only.kind === 'return' ? only.children[0] : undefined;
}

function implicitParameter() {
  return make('name', [], {
    binding: 'bound',
    value: IMPLICIT_PARAMETER,
    text: IMPLICIT_PARAMETER,
  });
}

function referencePredicate(node) {
  const groups = REFERENCE.exec(node.value ?? '')?.groups;
  if (groups === undefined) {
    return undefined;
  }
  const name = implicitParameter();
  const owner = make('name', [], { binding: 'free', value: groups.owner, text: groups.owner });
  const callee = make('member', [owner], { value: groups.method });
  return { name, value: make('call', [callee, name]) };
}

function predicateOf(lambda) {
  if (lambda?.kind === EXPRESSION_KIND) {
    return referencePredicate(lambda);
  }
  if (lambda?.kind !== 'lambda' || lambda.value !== undefined) {
    return undefined;
  }
  const [parameters, body] = lambda.children;
  const value = returnedValue(body);
  if (value === undefined || parameters.children.length > 1) {
    return undefined;
  }
  const [parameter] = parameters.children;
  return { name: parameter === undefined ? implicitParameter() : parameter.children[1], value };
}

function lambdaOf(name, value) {
  const parameter = make('parameter', [NONE, name]);
  return make('lambda', [
    make('parameters', [parameter]),
    make('block', [make('return', [value])]),
  ]);
}

function asCondition(root) {
  return rebuild(root, (node, children) =>
    node.kind === 'binary' && LOGICAL.has(node.value)
      ? { ...node, commutes: true, children }
      : { ...node, children },
  );
}

function anyOf(iterable, { name, value }) {
  const lambda = lambdaOf(name, asCondition(value));
  return make(EXPRESSION_KIND, [iterableOf(iterable), lambda], { value: 'any' });
}

function matchOf(kind, iterable, predicate) {
  if (kind === 'any') {
    return anyOf(iterable, predicate);
  }
  const value = kind === 'all' ? negated(predicate.value) : predicate.value;
  return negated(anyOf(iterable, { ...predicate, value }));
}

function generatorMatch(kind, generator) {
  if (generator?.kind !== EXPRESSION_KIND || !GENERATORS.has(generator.value)) {
    return undefined;
  }
  const [element, ...loops] = generator.children;
  if (loops.length !== 1) {
    return undefined;
  }
  const [name, iterable, ...filters] = loops[0].children;
  const tested = kind === 'all' ? negated(element) : element;
  const value = [...filters, tested].reduce((left, right) =>
    make('binary', [left, right], { value: '&&' }),
  );
  return kind === 'all'
    ? negated(anyOf(iterable, { name, value }))
    : matchOf(kind, iterable, { name, value });
}

function freeCallName(callee) {
  return callee.kind === 'name' && callee.binding === 'free' ? callee.value : undefined;
}

export function libraryMatch(node) {
  if (node.kind !== 'call') {
    return undefined;
  }
  const [callee, ...rest] = node.children;
  const builtin = MATCHES.get(freeCallName(callee));
  if (builtin !== undefined && rest.length === 1) {
    return generatorMatch(builtin, rest[0]);
  }
  const kind = callee.kind === 'member' ? MATCHES.get(callee.value) : undefined;
  const predicate = rest.length === 1 ? predicateOf(rest[0]) : undefined;
  return kind === undefined || predicate === undefined
    ? undefined
    : matchOf(kind, callee.children[0], predicate);
}

function referenceName(owner) {
  return owner.text ?? owner.value;
}

export function asReference(node) {
  const predicate = predicateOf(node);
  const call = predicate?.value;
  if (call?.kind !== 'call' || call.children.length !== 2) {
    return undefined;
  }
  const [callee, argument] = call.children;
  const owner = callee.children[0];
  const isStaticCall =
    callee.kind === 'member' &&
    owner.kind === 'name' &&
    owner.binding === 'free' &&
    argument.kind === 'name' &&
    argument.binding === 'bound' &&
    argument.value === predicate.name.value;
  return isStaticCall
    ? make(EXPRESSION_KIND, [], { value: `reference:${referenceName(owner)}::${callee.value}` })
    : undefined;
}

export function sameReference(node) {
  const groups =
    node.kind === EXPRESSION_KIND ? REFERENCE.exec(node.value ?? '')?.groups : undefined;
  return groups === undefined || node.value.startsWith('reference:')
    ? undefined
    : { ...node, value: `reference:${groups.owner}::${groups.method}` };
}

function loopPredicate(loop) {
  const [, name, iterable, body] = loop.children;
  const [only] = body.children;
  if (body.children.length !== 1 || only.kind !== 'if' || only.children[2].kind !== 'none') {
    return undefined;
  }
  const [condition, then] = only.children;
  const [jump] = then.children;
  const returned = then.children.length === 1 && jump.kind === 'return' ? jump.children[0] : NONE;
  const found = ['true', 'false'].find((value) => isBooleanLiteral(returned, value));
  return found === undefined ? undefined : { name, iterable, condition, found };
}

export function loopMatch(loop, next) {
  const predicate = loop?.kind === 'foreach' ? loopPredicate(loop) : undefined;
  const fallback = next?.kind === 'return' ? next.children[0] : undefined;
  if (predicate === undefined || !isBooleanLiteral(fallback, String(predicate.found !== 'true'))) {
    return undefined;
  }
  const { name, iterable, condition, found } = predicate;
  const match = anyOf(iterable, { name, value: condition });
  return make('return', [found === 'true' ? match : negated(match)], {
    start: loop.start,
    end: next.end,
  });
}

export function collapsedNegation(node) {
  const inner = node.kind === 'unary' && node.value === '!' ? node.children[0] : undefined;
  const match = inner?.kind === 'unary' && inner.value === '!' ? inner.children[0] : undefined;
  return match?.kind === EXPRESSION_KIND && match.value === 'any' ? match : undefined;
}
