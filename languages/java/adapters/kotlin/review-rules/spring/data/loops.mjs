import { WRITE_VERB } from '../rules/transactions.mjs';
import { isSelfCall, ownerOf, report, symbolOf } from '../spring-scopes.mjs';
import { BATCH_WRITES, ENTITY_WRITES, QUERY_TYPES, STANDARD_WRITES } from './data-types.mjs';
import {
  entityReceiver,
  inLoop,
  isCollection,
  references,
  repositoryReceiver,
} from './loop-scopes.mjs';

const READ = /^(?:find|get|read|count|exists|query|stream|search|load|fetch|list|is|has)/u;
const SINGLE_CALL = /^([\w.]+)\([^,]*\)$/su;
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
const QUERY_BUILDERS = new Set(['createQuery', 'createNativeQuery', 'setParameter', 'setHint']);

function site(rule, view, invocation) {
  return report(rule, invocation, symbolOf(view, invocation.scope, invocation.name));
}

function entityWrite(view, invocation) {
  return ENTITY_WRITES.has(invocation.name) && entityReceiver(view, invocation);
}

function referencesInLoops(view) {
  return view.file.invocations.flatMap((invocation) => references(view, invocation));
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

function batchOfOne(view) {
  return view.file.invocations
    .filter(
      (invocation) =>
        BATCH_WRITES.has(invocation.name) &&
        invocation.arguments.length === 1 &&
        ONE_ELEMENT.has(SINGLE_CALL.exec(invocation.arguments[0].text.trim())?.[1]) &&
        repositoryReceiver(view, invocation) &&
        inLoop(view, invocation.scope),
    )
    .map((invocation) => site('SpringDataBatchOfOne', view, invocation));
}

function rowWrite(view, invocation) {
  return (
    !STANDARD_WRITES.has(invocation.name) &&
    !READ.test(invocation.name) &&
    repositoryReceiver(view, invocation) &&
    !invocation.arguments.some(({ text }) => isCollection(view, invocation.scope, text))
  );
}

function queryUpdate(view, invocation) {
  return (
    invocation.name === 'executeUpdate' &&
    (QUERY_BUILDERS.has(invocation.previous?.name) ||
      view.is(view.typeOf(invocation.scope, invocation.receiver), QUERY_TYPES))
  );
}

function rowWritesInLoop(view) {
  const calls = view.file.invocations.filter(
    (invocation) =>
      invocation.reference !== true &&
      inLoop(view, invocation.scope) &&
      ((rowWrite(view, invocation) &&
        (invocation.statement === true || WRITE_VERB.test(invocation.name))) ||
        queryUpdate(view, invocation)),
  );
  const referenced = referencesInLoops(view).filter((invocation) => rowWrite(view, invocation));
  return [...calls, ...referenced].map((invocation) =>
    site('SpringDataRowWriteInLoop', view, invocation),
  );
}

function writingHelpers(view) {
  return view.file.functions.filter((fn) =>
    view.file.invocations.some(
      (invocation) =>
        invocation.reference !== true &&
        entityWrite(view, invocation) &&
        view.functionAt(invocation.scope) === fn,
    ),
  );
}

function helperCalled(view, helpers, invocation) {
  return helpers.some(
    (fn) =>
      fn.name === invocation.name &&
      fn.owner === ownerOf(view, invocation) &&
      (invocation.reference === true || fn.parameters.length === invocation.arguments.length),
  );
}

function saveInLoopHelpers(view) {
  const helpers = writingHelpers(view);
  const calls = view.file.invocations.filter(
    (invocation) =>
      isSelfCall(invocation) &&
      inLoop(view, invocation.scope) &&
      helperCalled(view, helpers, invocation),
  );
  const referenced = referencesInLoops(view).filter(
    (invocation) =>
      [undefined, 'this'].includes(invocation.receiver) && helperCalled(view, helpers, invocation),
  );
  return [...calls, ...referenced].map((invocation) =>
    site('SpringDataSaveInLoopHelper', view, invocation),
  );
}

export const LOOP_RULES = [saveInLoop, batchOfOne, rowWritesInLoop, saveInLoopHelpers];
