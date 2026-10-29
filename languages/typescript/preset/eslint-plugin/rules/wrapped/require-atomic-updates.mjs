import { createRequire } from 'node:module';
import path from 'node:path';
import { chainOf } from '../../../../../../shared/traversal.mjs';
import { variableNamed } from '../analysis/ancestry.mjs';
import { withReportFilter } from './report-filter.mjs';

const requireFromHere = createRequire(import.meta.url);
const eslintRules = path.join(path.dirname(requireFromHere.resolve('eslint')), 'rules');
const baseRule = requireFromHere(path.join(eslintRules, 'require-atomic-updates.js'));

const ANY_KEY = '*';
const MAX_KEYS = 16;
const TRANSPARENT = new Set([
  'TSNonNullExpression',
  'TSAsExpression',
  'TSSatisfiesExpression',
  'ChainExpression',
]);
const SKIPPED_KEYS = new Set(['parent', 'typeAnnotation', 'typeArguments', 'typeParameters']);
const CHAIN_TYPES = new Set(['Identifier', 'MemberExpression']);

function unwrapped(node) {
  return chainOf(node, (inner) => (TRANSPARENT.has(inner.type) ? inner.expression : undefined)).at(
    -1,
  );
}

function propertyKey(member) {
  if (!member.computed && member.property.type === 'Identifier') {
    return member.property.name;
  }
  return member.property.type === 'Literal' ? String(member.property.value) : ANY_KEY;
}

function memberChain(expression) {
  const nodes = chainOf(unwrapped(expression), (node) =>
    node.type === 'MemberExpression' ? unwrapped(node.object) : undefined,
  );
  const root = nodes.at(-1);
  if (root.type !== 'Identifier') {
    return undefined;
  }
  const members = nodes.slice(0, -1);
  return { root, members, keys: members.map((member) => propertyKey(member)).toReversed() };
}

function overlaps(read, written) {
  const shared = Math.min(read.length, written.length);
  return read
    .slice(0, shared)
    .every((key, index) => key === written[index] || key === ANY_KEY || written[index] === ANY_KEY);
}

function patternStep(keys, child, parent) {
  if (parent.type === 'RestElement') {
    return [];
  }
  if (parent.type === 'Property' && parent.value === child) {
    return [parent.computed ? ANY_KEY : (parent.key.name ?? String(parent.key.value)), ...keys];
  }
  if (parent.type === 'ArrayPattern') {
    return [ANY_KEY, ...keys];
  }
  return parent.type === 'AssignmentPattern' || parent.type === 'ObjectPattern' ? keys : undefined;
}

function patternKeys(identifier) {
  const nodes = chainOf(identifier, (node) =>
    node.parent !== undefined && node.parent.type !== 'VariableDeclarator'
      ? node.parent
      : undefined,
  );
  let keys = [];
  for (const [index, parent] of nodes.slice(1).entries()) {
    keys = patternStep(keys, nodes[index], parent);
    if (keys === undefined) {
      return [];
    }
  }
  return keys;
}

function childrenOf(node) {
  if (node.type === 'Property' && !node.computed) {
    return [node.value];
  }
  if (node.type === 'MemberExpression' && !node.computed) {
    return [node.object];
  }
  return Object.entries(node)
    .filter(([key]) => !SKIPPED_KEYS.has(key))
    .flatMap(([, value]) => (Array.isArray(value) ? value : [value]))
    .filter((value) => value !== null && typeof value === 'object');
}

function firstVisit(seen, variable, keys) {
  const visited = seen.get(variable) ?? new Set();
  seen.set(variable, visited);
  const key = keys.join('\0');
  const first = !visited.has(key);
  visited.add(key);
  return first;
}

function sourceOf(reference, keys) {
  const source = memberChain(reference.writeExpr);
  if (source === undefined) {
    return { node: reference.writeExpr, keys: [] };
  }
  return {
    node: source.root,
    keys: [...source.keys, ...patternKeys(reference.identifier), ...keys],
  };
}

function sourcesOf(variable, keys) {
  return variable.references
    .filter((reference) => reference.isWrite() && reference.writeExpr)
    .map((reference) => sourceOf(reference, keys));
}

function isFunctionLocal(variable, functionScope) {
  return (
    variable?.scope.variableScope === functionScope &&
    variable.defs.every(({ type }) => type === 'Variable')
  );
}

function expansionOf(chain, suffix, context) {
  const variable = variableNamed(context.sourceCode, chain.root);
  const expands =
    isFunctionLocal(variable, context.functionScope) &&
    suffix.length <= MAX_KEYS &&
    firstVisit(context.seen, variable, suffix);
  return expands ? sourcesOf(variable, suffix) : [];
}

function chainReads(chain, keys, context) {
  const suffix = [...chain.keys, ...keys];
  const computed = chain.members.filter((member) => member.computed);
  return {
    path: suffix.length > MAX_KEYS ? [ANY_KEY] : [chain.root.name, ...suffix],
    next: [
      ...computed.map((member) => ({ node: member.property, keys: [] })),
      ...expansionOf(chain, suffix, context),
    ],
  };
}

function readPaths(start, sourceCode, functionScope) {
  const context = { sourceCode, functionScope, seen: new Map() };
  const paths = [];
  const pending = [{ node: start, keys: [] }];
  for (const { node, keys } of pending) {
    const chain = CHAIN_TYPES.has(node.type) ? memberChain(node) : undefined;
    if (chain === undefined) {
      pending.push(...childrenOf(node).map((child) => ({ node: child, keys: [] })));
    } else {
      const { path: read, next } = chainReads(chain, keys, context);
      paths.push(read);
      pending.push(...next);
    }
  }
  return paths;
}

function readsWrittenLocation(assignment, sourceCode) {
  const written = memberChain(assignment.left);
  if (written === undefined) {
    return true;
  }
  const functionScope = sourceCode.getScope(assignment).variableScope;
  const target = [written.root.name, ...written.keys];
  return readPaths(assignment.right, sourceCode, functionScope).some((read) =>
    overlaps(read, target),
  );
}

function keepsReport({ node }, context) {
  return (
    node?.type !== 'AssignmentExpression' ||
    node.operator !== '=' ||
    readsWrittenLocation(node, context.sourceCode)
  );
}

export const rule = withReportFilter(baseRule, keepsReport);
