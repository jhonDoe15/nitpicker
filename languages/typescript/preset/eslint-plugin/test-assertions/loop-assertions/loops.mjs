import { ancestorsOf } from '../../rules/analysis/ancestry.mjs';
import { isFunctionNode } from '../../rules/analysis/constant-resolution.mjs';
import { propertyName } from '../unowned-async/nodes.mjs';

const LOOP_NAMES = new Map([
  ['ForStatement', 'for'],
  ['ForInStatement', 'for...in'],
  ['ForOfStatement', 'for...of'],
  ['WhileStatement', 'while'],
  ['DoWhileStatement', 'do...while'],
]);
const RUNS_ONCE = new Map([
  ['ForStatement', 'init'],
  ['ForInStatement', 'right'],
  ['ForOfStatement', 'right'],
]);
const ITERATING_METHODS = new Set([
  'forEach',
  'map',
  'flatMap',
  'filter',
  'some',
  'every',
  'reduce',
  'reduceRight',
  'find',
  'findIndex',
  'findLast',
  'findLastIndex',
]);
const ARRAY_FROM_MAPPER = 1;

function isArrayFrom(callee) {
  return (
    propertyName(callee) === 'from' &&
    callee.object.type === 'Identifier' &&
    callee.object.name === 'Array'
  );
}

function iterationOf(call, argument) {
  const { callee } = call;
  if (callee.type !== 'MemberExpression') {
    return undefined;
  }
  const name = propertyName(callee);
  if (isArrayFrom(callee) && call.arguments.indexOf(argument) === ARRAY_FROM_MAPPER) {
    return { node: call, name: 'Array.from', collection: call.arguments[0] };
  }
  if (ITERATING_METHODS.has(name) && call.arguments.includes(argument)) {
    return { node: call, name, collection: callee.object };
  }
  return undefined;
}

function loopOf(node, child) {
  const name = LOOP_NAMES.get(node.type);
  if (name === undefined || node[RUNS_ONCE.get(node.type)] === child) {
    return undefined;
  }
  return {
    node,
    name: node.await === true ? 'for await...of' : name,
    collection:
      node.type === 'ForOfStatement' || node.type === 'ForInStatement' ? node.right : undefined,
  };
}

function constructAt(node, child) {
  if (node.type === 'CallExpression') {
    return iterationOf(node, child);
  }
  return loopOf(node, child);
}

function isInline(fn) {
  const { parent } = fn;
  return (
    parent.type === 'CallExpression' && (parent.arguments.includes(fn) || parent.callee === fn)
  );
}

export function isIterationArgument(node) {
  return node.parent.type === 'CallExpression' && iterationOf(node.parent, node) !== undefined;
}

export function loopsAround(site, test) {
  const path = [site, ...ancestorsOf(site)];
  const inside = path.slice(0, path.indexOf(test));
  const stop = inside.findIndex((node) => isFunctionNode(node) && !isInline(node));
  const reach = stop < 0 ? inside : inside.slice(0, stop);
  return reach
    .map((node, index) => constructAt(inside[index + 1] ?? test, node))
    .filter((construct) => construct !== undefined);
}
