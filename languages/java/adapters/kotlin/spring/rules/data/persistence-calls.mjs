import { callsIn } from '../../syntax/kotlin-calls.mjs';
import { receiverMatches } from '../../syntax/kotlin-receivers.mjs';
import { kids, textOf } from '../../syntax/kotlin-tree.mjs';
import { ENTITY_MANAGER } from '../../names/spring-types.mjs';
import { ITERABLES } from '../../names/spring-body-types.mjs';

export const WRITES = new Set([
  'save',
  'saveAndFlush',
  'delete',
  'deleteById',
  'persist',
  'merge',
  'remove',
]);
export const FLUSHES = new Set(['saveAndFlush', 'saveAllAndFlush', 'flush']);
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

function isCollectionish(context, expression) {
  if (expression === undefined) {
    return false;
  }
  const { source } = context.file;
  if (expression.t === 'CALL_EXPRESSION') {
    return PRODUCERS.has(selectorName(source, expression));
  }
  if (expression.t === 'REFERENCE_EXPRESSION') {
    return receiverMatches(context, { receiver: expression }, ITERABLES);
  }
  if (!['DOT_QUALIFIED_EXPRESSION', 'SAFE_ACCESS_EXPRESSION'].includes(expression.t)) {
    return false;
  }
  const [first, , last] = kids(expression);
  const name = selectorName(source, last);
  return (
    PRODUCERS.has(name) ||
    (CHAINED.has(name) && isCollectionish(context, first)) ||
    (first.t === 'THIS_EXPRESSION' && receiverMatches(context, { receiver: expression }, ITERABLES))
  );
}

function loopClears(context, loop) {
  return callsIn(context.file.source, loop).some(
    (call) => call.name === 'clear' && receiverMatches(context, call, ENTITY_MANAGER),
  );
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

export function persistenceCalls({ context, targets, names }) {
  return callsIn(context.file.source, context.body)
    .filter((call) => names.has(call.name))
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
