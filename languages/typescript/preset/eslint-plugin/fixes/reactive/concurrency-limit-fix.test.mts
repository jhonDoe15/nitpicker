import { typescriptRuleTester } from '../../test-support/rule-tester.mts';
import { rule } from '../../rules/concurrency/reactive/unbounded-reactive-fan-out.mts';

const RX = 'import { forkJoin, from, merge, mergeMap, mergeAll, map, flatMap } from "rxjs";\n';
const OPERATORS =
  'import { flatMap, mergeMap, map, mergeAll } from "rxjs/operators";\nimport { from } from "rxjs";\n';

function data(operator: string, collection = 'ids') {
  return { operator, operation: 'fetch()', via: '', target: 'remote service', collection };
}

function suggests(messageId: string, operator: string, output: string, collection = 'ids') {
  return [
    {
      messageId,
      data: data(operator, collection),
      suggestions: [{ messageId: 'limit' as const, data: { limit: '8' }, output }],
    },
  ];
}

function declines(messageId: string, code: string, operator = 'mergeMap') {
  return { code, errors: [{ messageId, data: data(operator) }] };
}

function operatorCase(prefix: string, body: string, output: string, operator = 'mergeMap') {
  return {
    code: `${prefix}${body}`,
    errors: suggests('operator', operator, `${prefix}${output}`),
  };
}

typescriptRuleTester().run('unbounded-reactive-fan-out suggestions', rule, {
  valid: [],
  invalid: [
    operatorCase(
      RX,
      'from(ids).pipe(mergeMap((id) => from(fetch(id))));',
      'from(ids).pipe(mergeMap((id) => from(fetch(id)), 8));',
    ),
    operatorCase(
      RX,
      'from(ids).pipe(flatMap((id) => from(fetch(id))));',
      'from(ids).pipe(flatMap((id) => from(fetch(id)), 8));',
      'flatMap',
    ),
    operatorCase(
      OPERATORS,
      'from(ids).pipe(flatMap((id) => from(fetch(id))));',
      'from(ids).pipe(flatMap((id) => from(fetch(id)), 8));',
      'flatMap',
    ),
    operatorCase(
      RX,
      'from(ids).pipe(mergeMap((id) => from(fetch(id)), Infinity));',
      'from(ids).pipe(mergeMap((id) => from(fetch(id)), 8));',
    ),
    operatorCase(
      RX,
      'from(ids).pipe(mergeMap((id) => from(fetch(id)), Number.POSITIVE_INFINITY));',
      'from(ids).pipe(mergeMap((id) => from(fetch(id)), 8));',
    ),
    operatorCase(
      RX,
      'const NONE = Infinity; from(ids).pipe(mergeMap((id) => from(fetch(id)), NONE));',
      'const NONE = Infinity; from(ids).pipe(mergeMap((id) => from(fetch(id)), 8));',
    ),
    operatorCase(
      RX,
      'from(ids).pipe(mergeMap((id) => from(fetch(id)), undefined));',
      'from(ids).pipe(mergeMap((id) => from(fetch(id)), 8));',
    ),
    operatorCase(
      RX,
      'from(ids).pipe(map((id) => from(fetch(id))), mergeAll());',
      'from(ids).pipe(map((id) => from(fetch(id))), mergeAll(8));',
      'mergeAll',
    ),
    operatorCase(
      RX,
      'from(ids.map((id) => from(fetch(id)))).pipe(mergeAll());',
      'from(ids.map((id) => from(fetch(id)))).pipe(mergeAll(8));',
      'mergeAll',
    ),
    {
      code: `${RX}merge(...ids.map((id) => from(fetch(id))));`,
      errors: suggests('merge', 'merge', `${RX}merge(...ids.map((id) => from(fetch(id))), 8);`),
    },
    operatorCase(
      RX,
      'from(ids).pipe(map((id) => from(fetch(id))), mergeAll(Infinity));',
      'from(ids).pipe(map((id) => from(fetch(id))), mergeAll(8));',
      'mergeAll',
    ),
    operatorCase(
      RX,
      'from(ids.map((id) => from(fetch(id)))).pipe(mergeAll(Number.POSITIVE_INFINITY));',
      'from(ids.map((id) => from(fetch(id)))).pipe(mergeAll(8));',
      'mergeAll',
    ),
    operatorCase(
      RX,
      'const NONE = Infinity; from(ids.map((id) => from(fetch(id)))).pipe(mergeAll(NONE));',
      'const NONE = Infinity; from(ids.map((id) => from(fetch(id)))).pipe(mergeAll(8));',
      'mergeAll',
    ),
    operatorCase(
      RX,
      'from(ids.map((id) => from(fetch(id)))).pipe(mergeAll(undefined));',
      'from(ids.map((id) => from(fetch(id)))).pipe(mergeAll(8));',
      'mergeAll',
    ),
    {
      code: `${RX}merge(first, ...ids.map((id) => from(fetch(id))));`,
      errors: suggests(
        'merge',
        'merge',
        `${RX}merge(first, ...ids.map((id) => from(fetch(id))), 8);`,
      ),
    },
    declines(
      'operator',
      `${RX}from(ids).pipe(map((id) => from(fetch(id))), mergeAll(Infinity /* all */));`,
      'mergeAll',
    ),
    declines('merge', `${RX}merge(...ids.map((id) => from(fetch(id))), asyncScheduler);`, 'merge'),
    operatorCase(
      RX,
      'const load = (id) => from(fetch(id)); from(ids).pipe(mergeMap(load));',
      'const load = (id) => from(fetch(id)); from(ids).pipe(mergeMap(load, 8));',
    ),
    operatorCase(
      RX,
      'from(ids).pipe(mergeMap((id, index) => from(fetch(id + index))));',
      'from(ids).pipe(mergeMap((id, index) => from(fetch(id + index)), 8));',
    ),
    operatorCase(
      RX,
      'from(ids).pipe(\n  mergeMap(\n    (id) => from(fetch(id)),\n  ),\n);',
      'from(ids).pipe(\n  mergeMap(\n    (id) => from(fetch(id)), 8,\n  ),\n);',
    ),
    operatorCase(
      'import * as rx from "rxjs";\n',
      'rx.from(ids).pipe(rx.mergeMap((id) => rx.from(fetch(id))));',
      'rx.from(ids).pipe(rx.mergeMap((id) => rx.from(fetch(id)), 8));',
    ),
    operatorCase(
      'import { from, mergeMap as mm } from "rxjs";\n',
      'from(ids).pipe(mm((id) => from(fetch(id))));',
      'from(ids).pipe(mm((id) => from(fetch(id)), 8));',
      'mergeMap',
    ),
    declines(
      'operator',
      `${RX}from(ids).pipe(mergeMap((id) => from(fetch(id)), (id, response) => [id, response]));`,
    ),
    declines(
      'operator',
      `${RX}const pair = (id, response) => [id, response]; from(ids).pipe(mergeMap((id) => from(fetch(id)), pair));`,
    ),
    declines(
      'operator',
      `${RX}function pair(id, response) { return [id, response]; } from(ids).pipe(flatMap((id) => from(fetch(id)), pair));`,
      'flatMap',
    ),
    declines(
      'operator',
      `${RX}from(ids).pipe(mergeMap((id) => from(fetch(id)) /* all at once */));`,
    ),
    declines(
      'operator',
      `${RX}from(ids).pipe(mergeMap((id) => from(fetch(id)), Infinity /* all */));`,
    ),
    declines(
      'operator',
      `${RX}from(ids).pipe(mergeMap((id) => from(fetch(id)), /* all */ undefined));`,
    ),
    declines(
      'operator',
      `${RX}from(ids).pipe(map((id) => from(fetch(id))), mergeAll(/* all */));`,
      'mergeAll',
    ),
    declines('forkJoin', `${RX}forkJoin(ids.map((id) => from(fetch(id))));`, 'forkJoin'),
    declines('merge', `${RX}merge(ids.map((id) => from(fetch(id))));`, 'merge'),
    declines('merge', `${RX}merge(...ids.map((id) => from(fetch(id))) /* all */);`, 'merge'),
  ],
});
