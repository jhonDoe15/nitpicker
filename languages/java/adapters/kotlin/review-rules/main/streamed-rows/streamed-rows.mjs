import { springViews } from '../../spring/view/spring-view.mjs';
import { returnTypeOf, symbolOf } from '../../spring/spring-scopes.mjs';

export const STREAMED_ROWS_RULE = 'StreamedRowsCollected';

const MESSAGE =
  'This repository method streams its rows, but the whole result is collected into one collection, so every row is held in memory at once, which is what streaming avoids and what runs out of memory on a large table. Handle each row in forEach, or flush a fixed-size batch there (add, and at 500 rows save the batch and clear it), and the rest once after it. An exception fits only for a query that always returns a handful of rows.';
const STREAM_TYPE = /^(?:java\.util\.stream\.)?Stream<.*>\??$/su;
const STEPS = new Set([
  'map',
  'filter',
  'peek',
  'distinct',
  'sorted',
  'flatMap',
  'mapNotNull',
  'skip',
  'onClose',
  'asSequence',
]);
const SINKS = new Set([
  'toList',
  'toSet',
  'toMutableList',
  'toMutableSet',
  'toArray',
  'collect',
  'associate',
  'associateBy',
  'groupBy',
]);

function collectsAll(invocation) {
  const sink = (invocation.after ?? []).find((name) => !STEPS.has(name));
  return SINKS.has(sink);
}

function streamsRows(view, invocation) {
  const type =
    invocation.receiver === undefined
      ? undefined
      : view.typeOf(invocation.scope, invocation.receiver);
  const declared = type === undefined ? undefined : view.projectFunctions(type, invocation.name)[0];
  return (
    declared !== undefined &&
    view.isRepository(type) &&
    STREAM_TYPE.test(returnTypeOf(view, declared) ?? '')
  );
}

function findingsOf(view, finding) {
  return view.file.invocations
    .filter((invocation) => collectsAll(invocation) && streamsRows(view, invocation))
    .map((invocation) =>
      finding({
        rule: STREAMED_ROWS_RULE,
        file: view.file.file,
        line: invocation.line,
        symbol: symbolOf(view, invocation.scope, invocation.name),
        message: MESSAGE,
      }),
    );
}

export function streamedRowsFindings(files, { finding, declaredIn = files }) {
  return springViews({ files, projectFiles: declaredIn, projectRoot: '', javaRoots: [] }).flatMap(
    (view) => findingsOf(view, finding),
  );
}
