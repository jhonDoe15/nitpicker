import {
  FLUSHES,
  functionContexts,
  insideIteration,
  insideLoopWithoutClear,
  nearestLoopClears,
  persistenceCalls,
  repositoryTargets,
  WRITES,
} from './persistence-calls.mjs';
import { defineRule, hitOn, memberSymbolOf } from '../rule-support.mjs';

function callHits(file, project, { names, flagged }) {
  const targets = repositoryTargets(project);
  return functionContexts(file).flatMap((context) =>
    persistenceCalls({ context, targets, names })
      .filter((call) => flagged(context, call))
      .map((call) => hitOn(call.node, `${memberSymbolOf(context.scope.fn)}@${call.name}`)),
  );
}

const saveInLoop = defineRule(
  'SpringDataNoSaveInLoop',
  'Do not save or delete one entity per loop iteration. Collect the entities and call saveAll or deleteAll once.',
  (file, project) =>
    callHits(file, project, {
      names: WRITES,
      flagged: (context, call) =>
        call.reference
          ? insideIteration(context, call)
          : insideLoopWithoutClear(context, call) || insideIteration(context, call),
    }),
);

const noFlush = defineRule(
  'SpringDataNoFlush',
  'Do not flush by hand. Let the transaction write changes at commit; an early flush defeats JDBC batching and hides ordering bugs.',
  (file, project) =>
    callHits(file, project, {
      names: FLUSHES,
      flagged: (context, call) => !call.reference && !nearestLoopClears(context, call),
    }),
);

export const DATA_CALL_RULES = [saveInLoop, noFlush];
