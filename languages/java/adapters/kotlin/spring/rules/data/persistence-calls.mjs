import { callsIn } from '../../syntax/kotlin-calls.mjs';
import { receiverMatches } from '../../syntax/kotlin-receivers.mjs';
import { kids, textOf } from '../../syntax/kotlin-tree.mjs';
import { ENTITY_MANAGER } from '../../names/spring-types.mjs';
import { ITERABLES } from '../../names/spring-body-types.mjs';

const WRITES = new Set([
  'save',
  'saveAndFlush',
  'delete',
  'deleteById',
  'persist',
  'merge',
  'remove',
]);
const FLUSHES = new Set(['saveAndFlush', 'saveAllAndFlush', 'flush']);
const ITERATIONS = new Set([
  'forEach',
  'forEachIndexed',
  'forEachOrdered',
  'map',
  'mapIndexed',
  'mapNotNull',
  'flatMap',
  'onEach',
  'peek',
]);
const PRODUCERS = new Set([
  'findAll',
  'findAllById',
  'stream',
  'asSequence',
  'asIterable',
  'toList',
  'toSet',
  'toMutableList',
  'listOf',
  'setOf',
  'mapOf',
  'arrayListOf',
  'mutableListOf',
  'mutableSetOf',
  'entries',
  'values',
  'keys',
  'sorted',
  'sortedBy',
  'distinct',
  'reversed',
]);
const CHAINED = new Set([
  'filter',
  'filterNotNull',
  'map',
  'mapNotNull',
  'take',
  'drop',
  'flatMap',
]);
const LOOPS = new Set(['FOR', 'WHILE', 'DO_WHILE']);

function selectorName(source, selector) {
  const callee = selector.t === 'CALL_EXPRESSION' ? kids(selector)[0] : selector;
  return callee?.t === 'REFERENCE_EXPRESSION' ? textOf(source, callee) : '';
}

function qualifiedStep(context, expression) {
  const [first, , last] = kids(expression);
  const name = selectorName(context.file.source, last);
  if (PRODUCERS.has(name)) {
    return { result: true };
  }
  if (first.t === 'THIS_EXPRESSION') {
    return { result: receiverMatches(context, { receiver: expression }, ITERABLES) };
  }
  return CHAINED.has(name) ? { next: first } : { result: false };
}

function collectionStep(context, expression) {
  if (expression === undefined) {
    return { result: false };
  }
  if (expression.t === 'CALL_EXPRESSION') {
    return { result: PRODUCERS.has(selectorName(context.file.source, expression)) };
  }
  if (expression.t === 'REFERENCE_EXPRESSION') {
    return { result: receiverMatches(context, { receiver: expression }, ITERABLES) };
  }
  return ['DOT_QUALIFIED_EXPRESSION', 'SAFE_ACCESS_EXPRESSION'].includes(expression.t)
    ? qualifiedStep(context, expression)
    : { result: false };
}

function isCollectionish(context, expression) {
  const pending = [expression];
  for (const current of pending) {
    const { result, next } = collectionStep(context, current);
    if (next === undefined) {
      return result;
    }
    pending.push(next);
  }
  return false;
}

function loopClears(context, loop) {
  return callsIn(context.file.source, loop).some(
    (call) => call.name === 'clear' && receiverMatches(context, call, ENTITY_MANAGER),
  );
}

export function writeCallNames() {
  return WRITES;
}

export function flushCallNames() {
  return FLUSHES;
}

export function functionContexts(file) {
  return file.functions
    .filter((declaration) => declaration.body !== undefined)
    .map((declaration) => ({
      file,
      scope: { owner: declaration.owner, fn: declaration },
      body: declaration.body,
    }));
}

function hasName(names, name) {
  return typeof names === 'function' ? names(name) : names.has(name);
}

export function persistenceCalls({ context, targets, names }) {
  return callsIn(context.file.source, context.body)
    .filter((call) => hasName(names, call.name))
    .filter((call) => receiverMatches(context, call, targets));
}

export function repositoryTargets(project) {
  return new Set([...project.repositoryTypes, ...ENTITY_MANAGER]);
}

export function insideLoopWithoutClear(context, call) {
  return call.ancestors
    .filter((node) => LOOPS.has(node.t))
    .some((loop) => !loopClears(context, loop));
}

export function nearestLoopClears(context, call) {
  const loop = call.ancestors.filter((node) => LOOPS.has(node.t)).at(-1);
  return loop !== undefined && loopClears(context, loop);
}

export function insideIteration(context, call) {
  const iterations = callsIn(context.file.source, context.body).filter(
    (candidate) => ITERATIONS.has(candidate.name) && !candidate.reference,
  );
  return iterations
    .filter((iteration) => call.ancestors.includes(iteration.node))
    .some((iteration) => isCollectionish(context, iteration.receiver));
}
