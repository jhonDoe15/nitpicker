import { WRITE_VERB } from '../../rules/transactions.mjs';
import { report, symbolOf } from '../../spring-scopes.mjs';
import { BATCH_WRITES, STANDARD_WRITES } from '../data-types.mjs';
import { saveInLoopHelpers } from './helpers.mjs';
import { loopVariable, oneElement, oneElementCall, queryUpdate } from './updates.mjs';
import {
  ITERATING,
  PASS_THROUGH,
  elementIsCollection,
  entityWrite,
  hostOf,
  inLoop,
  isCollection,
  loopFrames,
  referencesInLoops,
  repositoryReceiver,
} from './loop-scopes.mjs';

const MUTATORS = /^(?:add|plus|put|set|remove|retain|clear)/u;
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
const IGNORED_RESULTS = new Set([...ITERATING, 'apply', 'also', 'executeWithoutResult']);
const RESULT_DEPTH = 6;
const NOTHING = /^(?:Unit|Void|Nothing)\??$/u;

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

function mutated(view, local) {
  return view.file.invocations.some(
    (entry) =>
      ((entry.assign === true && entry.name === local.name) ||
        (entry.receiver === local.name && MUTATORS.test(entry.name))) &&
      view.chain(entry.scope).some(({ id }) => id === local.scope),
  );
}

function oneElementLocal(view, invocation, text) {
  const frames = view.chain(invocation.scope);
  const loop = frames.indexOf(loopFrames(view, invocation.scope).at(-1));
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
  return initializer !== undefined && oneElementCall(initializer) && !mutated(view, local);
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
    !setBased(view, invocation)
  );
}

function setBased(view, invocation) {
  const collections = invocation.arguments.map(
    ({ text }) => isCollection(view, invocation.scope, text) && !oneElement(text),
  );
  return (
    collections[0] === true ||
    (collections.includes(true) &&
      !invocation.arguments.some(
        ({ text }, index) => !collections[index] && loopVariable(view, invocation, text),
      ))
  );
}

function returnsNothing(view, invocation) {
  const type = view.typeOf(invocation.scope, invocation.receiver);
  const fn = type === undefined ? undefined : view.projectFunctions(type, invocation.name)[0];
  return fn !== undefined && NOTHING.test(fn.returnType ?? 'Unit');
}

function dropped(invocation) {
  return invocation.statement === true || invocation.branch === true;
}

function discarded(view, invocation) {
  if (
    !dropped(invocation) ||
    (invocation.after !== undefined && !returnsNothing(view, invocation))
  ) {
    return false;
  }
  const calls = [invocation];
  for (const call of calls) {
    const [frame] = view.chain(call.scope);
    if (call.result !== true || frame === undefined || IGNORED_RESULTS.has(frame.host)) {
      return true;
    }
    const host = hostOf(view, frame);
    if (host === undefined || calls.length > RESULT_DEPTH) {
      return true;
    }
    if (!dropped(host)) {
      return false;
    }
    calls.push(host);
  }
  return true;
}

function rowWritesInLoop(view) {
  const calls = view.file.invocations.filter(
    (invocation) =>
      invocation.reference !== true &&
      inLoop(view, invocation.scope) &&
      ((rowWrite(view, invocation) &&
        (discarded(view, invocation) || WRITE_VERB.test(invocation.name))) ||
        queryUpdate(view, invocation)),
  );
  const referenced = referencesInLoops(view).filter(
    (invocation) =>
      (ITERATING.has(invocation.host) ||
        (PASS_THROUGH.has(invocation.host) && discarded(view, invocation))) &&
      !elementIsCollection(view, invocation.scope, invocation.iterated) &&
      rowWrite(view, invocation),
  );
  return [...calls, ...referenced].map((invocation) =>
    site('SpringDataRowWriteInLoop', view, invocation),
  );
}

export const LOOP_RULES = [saveInLoop, batchOfOne, rowWritesInLoop, saveInLoopHelpers];
