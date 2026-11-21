import { NONE, categoryOf, isOneOf, make, placed, present, rebuild } from '../tree/nodes.mts';
import type { TreeNode } from '../tree/tree-types.mts';

type Predicate = { readonly name: TreeNode; readonly value: TreeNode };
type Reference = { readonly owner: string; readonly method: string };
type LoopPredicate = {
  readonly name: TreeNode;
  readonly iterable: TreeNode;
  readonly condition: TreeNode;
  readonly found: string;
};

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
const STREAM = new Set(['stream']);
const CHARACTER_VIEWS = new Set(['chars', 'toCharArray']);
const REFERENCE = /^(?:method_reference|reference):(?<owner>[\w.]+)::(?<method>\w+)$/u;
const IMPLICIT_PARAMETER = 'it';
const GENERATORS = new Set(['generator', 'list-comprehension']);
const LOGICAL = new Set(['&&', '||']);

function isBooleanLiteral(node: TreeNode | undefined, value: string): boolean {
  return node?.kind === 'literal' && node.literal === 'boolean' && node.value === value;
}

function negated(node: TreeNode): TreeNode {
  if (node.kind === 'unary' && node.value === '!') {
    return present(node.children[0]);
  }
  return make('unary', [node], { value: '!' });
}

function isMember(node: TreeNode | undefined, names: ReadonlySet<string>): node is TreeNode {
  return node?.kind === 'member' && isOneOf(names, node.value);
}

function iterableOf(receiver: TreeNode): TreeNode {
  if (receiver.kind !== 'call') {
    return receiver;
  }
  const [callee, ...rest] = receiver.children;
  if (isMember(callee, STREAM) && rest.length === 0) {
    return present(callee.children[0]);
  }
  if (isMember(callee, STREAM) && rest.length === 1) {
    return present(rest[0]);
  }
  if (isMember(callee, CHARACTER_VIEWS) && rest.length === 0) {
    return make(EXPRESSION_KIND, [present(callee.children[0])], { value: 'characters' });
  }
  return receiver;
}

function returnedValue(body: TreeNode): TreeNode | undefined {
  if (categoryOf(body) === EXPRESSION_KIND) {
    return body;
  }
  const [only] = body.children;
  return body.children.length === 1 && only?.kind === 'return' ? only.children[0] : undefined;
}

function implicitParameter(): TreeNode {
  return make('name', [], {
    binding: 'bound',
    value: IMPLICIT_PARAMETER,
    text: IMPLICIT_PARAMETER,
  });
}

function referenceParts(node: TreeNode): Reference | undefined {
  const groups = REFERENCE.exec(node.value ?? '')?.groups;
  const owner = groups?.['owner'];
  const method = groups?.['method'];
  return owner === undefined || method === undefined ? undefined : { owner, method };
}

function referencePredicate(node: TreeNode): Predicate | undefined {
  const parts = referenceParts(node);
  if (parts === undefined) {
    return undefined;
  }
  const name = implicitParameter();
  const owner = make('name', [], { binding: 'free', value: parts.owner, text: parts.owner });
  const callee = make('member', [owner], { value: parts.method });
  return { name, value: make('call', [callee, name]) };
}

function predicateOf(lambda: TreeNode | undefined): Predicate | undefined {
  if (lambda?.kind === EXPRESSION_KIND) {
    return referencePredicate(lambda);
  }
  if (lambda?.kind !== 'lambda' || lambda.value !== undefined) {
    return undefined;
  }
  const [parameters, body] = lambda.children;
  const value = returnedValue(present(body));
  const list = present(parameters);
  if (value === undefined || list.children.length > 1) {
    return undefined;
  }
  const [parameter] = list.children;
  return {
    name: parameter === undefined ? implicitParameter() : present(parameter.children[1]),
    value,
  };
}

function lambdaOf(name: TreeNode, value: TreeNode): TreeNode {
  const parameter = make('parameter', [NONE, name]);
  return make('lambda', [
    make('parameters', [parameter]),
    make('block', [make('return', [value])]),
  ]);
}

function asCondition(root: TreeNode): TreeNode {
  return rebuild(root, (node, children) =>
    node.kind === 'binary' && isOneOf(LOGICAL, node.value)
      ? { ...node, commutes: true, children }
      : { ...node, children },
  );
}

function anyOf(iterable: TreeNode, { name, value }: Predicate): TreeNode {
  const lambda = lambdaOf(name, asCondition(value));
  return make(EXPRESSION_KIND, [iterableOf(iterable), lambda], { value: 'any' });
}

function matchOf(kind: string, iterable: TreeNode, predicate: Predicate): TreeNode {
  if (kind === 'any') {
    return anyOf(iterable, predicate);
  }
  const value = kind === 'all' ? negated(predicate.value) : predicate.value;
  return negated(anyOf(iterable, { ...predicate, value }));
}

function generatorMatch(kind: string, generator: TreeNode | undefined): TreeNode | undefined {
  if (generator?.kind !== EXPRESSION_KIND || !isOneOf(GENERATORS, generator.value)) {
    return undefined;
  }
  const [element, ...loops] = generator.children;
  if (loops.length !== 1) {
    return undefined;
  }
  const [name, iterable, ...filters] = present(loops[0]).children;
  const tested = kind === 'all' ? negated(present(element)) : present(element);
  const value = [...filters, tested].reduce((left, right) =>
    make('binary', [left, right], { value: '&&' }),
  );
  return kind === 'all'
    ? negated(anyOf(present(iterable), { name: present(name), value }))
    : matchOf(kind, present(iterable), { name: present(name), value });
}

function freeCallName(callee: TreeNode | undefined): string | undefined {
  return callee?.kind === 'name' && callee.binding === 'free' ? callee.value : undefined;
}

export function libraryMatch(node: TreeNode): TreeNode | undefined {
  if (node.kind !== 'call') {
    return undefined;
  }
  const [callee, ...rest] = node.children;
  const calledName = freeCallName(callee);
  const builtin = calledName === undefined ? undefined : MATCHES.get(calledName);
  if (builtin !== undefined && rest.length === 1) {
    return generatorMatch(builtin, rest[0]);
  }
  const kind =
    callee?.kind === 'member' && callee.value !== undefined ? MATCHES.get(callee.value) : undefined;
  const predicate = rest.length === 1 ? predicateOf(rest[0]) : undefined;
  return kind === undefined || predicate === undefined
    ? undefined
    : matchOf(kind, present(present(callee).children[0]), predicate);
}

function referenceName(owner: TreeNode): string | undefined {
  return owner.text ?? owner.value;
}

export function asReference(node: TreeNode): TreeNode | undefined {
  const predicate = predicateOf(node);
  const call = predicate?.value;
  if (call?.kind !== 'call' || call.children.length !== 2) {
    return undefined;
  }
  const [callee, argument] = call.children;
  const owner = present(callee).children[0];
  const isStaticCall =
    callee?.kind === 'member' &&
    owner?.kind === 'name' &&
    owner.binding === 'free' &&
    argument?.kind === 'name' &&
    argument.binding === 'bound' &&
    argument.value === predicate?.name.value;
  return isStaticCall
    ? make(EXPRESSION_KIND, [], {
        value: `reference:${String(referenceName(owner))}::${String(callee.value)}`,
      })
    : undefined;
}

export function sameReference(node: TreeNode): TreeNode | undefined {
  const parts = node.kind === EXPRESSION_KIND ? referenceParts(node) : undefined;
  return parts === undefined || node.value?.startsWith('reference:') === true
    ? undefined
    : { ...node, value: `reference:${parts.owner}::${parts.method}` };
}

function loopPredicate(loop: TreeNode): LoopPredicate | undefined {
  const [, name, iterable, body] = loop.children;
  const statements = present(body).children;
  const [only] = statements;
  if (statements.length !== 1 || only?.kind !== 'if' || present(only.children[2]).kind !== 'none') {
    return undefined;
  }
  const [condition, then] = only.children;
  const [jump] = present(then).children;
  const returned =
    present(then).children.length === 1 && jump?.kind === 'return' ? jump.children[0] : NONE;
  const found = ['true', 'false'].find((value) => isBooleanLiteral(returned, value));
  return found === undefined
    ? undefined
    : {
        name: present(name),
        iterable: present(iterable),
        condition: present(condition),
        found,
      };
}

export function loopMatch(
  loop: TreeNode | undefined,
  next: TreeNode | undefined,
): TreeNode | undefined {
  const predicate = loop?.kind === 'foreach' ? loopPredicate(loop) : undefined;
  const fallback = next?.kind === 'return' ? next.children[0] : undefined;
  if (predicate === undefined || !isBooleanLiteral(fallback, String(predicate.found !== 'true'))) {
    return undefined;
  }
  const { name, iterable, condition, found } = predicate;
  const match = anyOf(iterable, { name, value: condition });
  return make(
    'return',
    [found === 'true' ? match : negated(match)],
    placed(loop?.start, next?.end),
  );
}

export function collapsedNegation(node: TreeNode): TreeNode | undefined {
  const inner = node.kind === 'unary' && node.value === '!' ? node.children[0] : undefined;
  const match = inner?.kind === 'unary' && inner.value === '!' ? inner.children[0] : undefined;
  return match?.kind === EXPRESSION_KIND && match.value === 'any' ? match : undefined;
}
