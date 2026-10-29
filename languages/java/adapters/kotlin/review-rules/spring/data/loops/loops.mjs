import { WRITE_VERB } from '../../rules/transactions.mjs';
import { report, symbolOf } from '../../spring-scopes.mjs';
import { BATCH_WRITES, QUERY_TYPES, STANDARD_WRITES } from '../data-types.mjs';
import { lastSelector, parseSelector } from '../../view/expressions.mjs';
import { saveInLoopHelpers } from './helpers.mjs';
import {
  ITERATING,
  chainOf,
  elementIsCollection,
  entityWrite,
  inLoop,
  isCollection,
  loopFrames,
  referencesInLoops,
  repositoryReceiver,
} from './loop-scopes.mjs';

const QUALIFIER = /^[\w.]+$/u;
const READ = /^(?:find|get|read|count|exists|query|stream|search|load|fetch|list|is|has)/u;
const SCOPE_FUNCTIONS = new Set([
  'apply',
  'let',
  'run',
  'also',
  'with',
  'takeIf',
  'takeUnless',
  'toString',
  'equals',
  'hashCode',
]);
const DISCARDED_RESULTS = new Set([...ITERATING, 'apply', 'also']);
const ONE_ELEMENT = new Set([
  'listOf',
  'setOf',
  'mutableListOf',
  'mutableSetOf',
  'arrayListOf',
  'List.of',
  'Set.of',
  'java.util.List.of',
  'java.util.Set.of',
  'singletonList',
  'singleton',
  'Collections.singletonList',
  'Collections.singleton',
]);
const QUERY_BUILDERS = new Set([
  'createQuery',
  'createNamedQuery',
  'createNativeQuery',
  'setParameter',
  'setHint',
  'setLockMode',
  'setFlushMode',
  'setFirstResult',
  'setMaxResults',
]);

function site(rule, view, invocation) {
  return report(rule, invocation, symbolOf(view, invocation.scope, invocation.name));
}

function saveInLoop(view) {
  const calls = view.file.invocations.filter(
    (invocation) =>
      invocation.reference !== true &&
      entityWrite(view, invocation) &&
      inLoop(view, invocation.scope),
  );
  const referenced = referencesInLoops(view).filter((invocation) => entityWrite(view, invocation));
  return [...calls, ...referenced].map((invocation) =>
    site('SpringDataNoSaveInLoop', view, invocation),
  );
}

function singleArgument(values) {
  const [only, ...rest] = values;
  return only !== undefined && rest.length === 0 && only.spread !== true && only.lambda !== true;
}

function oneElement(text) {
  const parts = lastSelector(text.trim());
  const call = parseSelector(parts?.selector ?? text.trim());
  const qualifier = parts === undefined || QUALIFIER.test(parts.head);
  return (
    qualifier &&
    call?.call === true &&
    singleArgument(call.arguments) &&
    ONE_ELEMENT.has([parts?.head, call.name].filter(Boolean).join('.'))
  );
}

function oneElementLocal(view, invocation, text) {
  const frames = view.chain(invocation.scope);
  const loop = frames.indexOf(loopFrames(view, invocation.scope)[0]);
  const inner = new Set(frames.slice(0, loop + 1).map(({ id }) => id));
  const local = (view.file.locals ?? []).findLast(
    (entry) => entry.name === text && inner.has(entry.scope),
  );
  const initializer = view.file.invocations.find(
    (entry) =>
      local !== undefined &&
      entry.assignedTo === local.name &&
      entry.scope === local.scope &&
      entry.line === local.line &&
      entry.after === undefined,
  );
  return (
    initializer !== undefined &&
    singleArgument(initializer.arguments) &&
    ONE_ELEMENT.has([initializer.receiver, initializer.name].filter(Boolean).join('.'))
  );
}

function batchOfOne(view) {
  return view.file.invocations
    .filter(
      (invocation) =>
        BATCH_WRITES.has(invocation.name) &&
        invocation.arguments.length === 1 &&
        (oneElement(invocation.arguments[0].text) ||
          oneElementLocal(view, invocation, invocation.arguments[0].text.trim())) &&
        repositoryReceiver(view, invocation) &&
        inLoop(view, invocation.scope),
    )
    .map((invocation) => site('SpringDataBatchOfOne', view, invocation));
}

function rowWrite(view, invocation) {
  return (
    !STANDARD_WRITES.has(invocation.name) &&
    !SCOPE_FUNCTIONS.has(invocation.name) &&
    !READ.test(invocation.name) &&
    repositoryReceiver(view, invocation) &&
    !invocation.arguments.some(({ text }) => isCollection(view, invocation.scope, text))
  );
}

function selfStatement(view, invocation) {
  const host = view.chain(invocation.scope)[0]?.host;
  return (
    invocation.statement === true &&
    invocation.after === undefined &&
    !(invocation.result === true && !DISCARDED_RESULTS.has(host))
  );
}

function bindsCollection(view, invocation) {
  return chainOf(view, invocation).some(
    (call) =>
      call.name === 'setParameter' &&
      call.arguments.some(({ text }, index) => index > 0 && isCollection(view, call.scope, text)),
  );
}

function queryUpdate(view, invocation) {
  return (
    invocation.name === 'executeUpdate' &&
    (QUERY_BUILDERS.has(invocation.previous?.name) ||
      view.is(view.typeOf(invocation.scope, invocation.receiver), QUERY_TYPES)) &&
    !bindsCollection(view, invocation)
  );
}

function rowWritesInLoop(view) {
  const calls = view.file.invocations.filter(
    (invocation) =>
      invocation.reference !== true &&
      inLoop(view, invocation.scope) &&
      ((rowWrite(view, invocation) &&
        (selfStatement(view, invocation) || WRITE_VERB.test(invocation.name))) ||
        queryUpdate(view, invocation)),
  );
  const referenced = referencesInLoops(view).filter(
    (invocation) =>
      ITERATING.has(invocation.host) &&
      !elementIsCollection(view, invocation.scope, invocation.iterated) &&
      rowWrite(view, invocation),
  );
  return [...calls, ...referenced].map((invocation) =>
    site('SpringDataRowWriteInLoop', view, invocation),
  );
}

export const LOOP_RULES = [saveInLoop, batchOfOne, rowWritesInLoop, saveInLoopHelpers];
