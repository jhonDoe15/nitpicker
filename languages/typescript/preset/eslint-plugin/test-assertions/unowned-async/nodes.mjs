import { chainOf } from '../../rules/analysis/ancestry.mjs';

const ASSERTION_ROOTS = new Set(['expect', 'assert', 'should']);
const NOT_ASSERTIONS = new Set([
  'any',
  'anything',
  'objectContaining',
  'arrayContaining',
  'stringContaining',
  'stringMatching',
  'closeTo',
  'extend',
  'addSnapshotSerializer',
  'addEqualityTesters',
  'getState',
  'setState',
  'assertions',
  'hasAssertions',
]);

export function propertyName(node) {
  if (node?.type !== 'MemberExpression') {
    return undefined;
  }
  if (!node.computed) {
    return node.property.type === 'Identifier' ? node.property.name : undefined;
  }
  return typeof node.property.value === 'string' ? node.property.value : undefined;
}

function calleeLinks(callee) {
  return chainOf(callee, (current) => {
    if (current.type === 'CallExpression') {
      return current.callee;
    }
    return current.type === 'MemberExpression' ? current.object : undefined;
  });
}

export function rootName(node) {
  const root = calleeLinks(node).at(-1);
  if (root?.type === 'ThisExpression') {
    return 'this';
  }
  return root?.type === 'Identifier' ? root.name : undefined;
}

function isAssertRoot(name, bindings) {
  return (
    ASSERTION_ROOTS.has(name) ||
    bindings.asserts.named.has(name) ||
    bindings.asserts.namespaces.has(name)
  );
}

export function isAssertion(node, bindings) {
  if (node.type !== 'CallExpression') {
    return false;
  }
  const links = calleeLinks(node.callee);
  const root = links.at(-1);
  if (root?.type !== 'Identifier' || root.name === 'console') {
    return false;
  }
  if (isAssertRoot(root.name, bindings)) {
    const [firstMember] = links.toReversed().slice(1);
    return !NOT_ASSERTIONS.has(propertyName(firstMember));
  }
  return links.some((link) => ['assert', 'should'].includes(propertyName(link)));
}

export function countsAsAssertion(node, bindings) {
  return (
    isAssertion(node, bindings) &&
    !calleeLinks(node.callee).some(
      (link) => link.type === 'CallExpression' && isAssertion(link, bindings),
    )
  );
}

export function children(context, node) {
  if (!node) {
    return [];
  }
  return (context.sourceCode.visitorKeys[node.type] ?? [])
    .flatMap((key) => (Array.isArray(node[key]) ? node[key] : [node[key]]))
    .filter((child) => child !== null && typeof child?.type === 'string');
}

function enterAll() {
  return true;
}

export function nodesIn(context, root, enter = enterAll) {
  const pending = root !== undefined && enter(root) ? [root] : [];
  for (const node of pending) {
    for (const child of children(context, node).filter(enter)) {
      pending.push(child);
    }
  }
  return pending;
}
