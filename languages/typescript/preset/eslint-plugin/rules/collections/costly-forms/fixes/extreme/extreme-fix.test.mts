import vm from 'node:vm';
import { afterAll, describe, expect, it } from 'vitest';
import { typedCases } from '../../../../../test-support/typed-cases.mts';
import { typescriptRuleTester } from '../../../../../test-support/rule-tester.mts';
import { ts } from '../../../../typed/typescript-views.mts';
import { rule } from '../../no-costly-collection-form.mts';
import {
  fixed,
  HEAD,
  reduced,
  rowsFix,
  wrapped,
  type FixCase,
  type Kind,
} from './extreme-cases.mts';

const { tester, cleanup, typed } = typedCases('nitpicker-extreme-fix-', { lib: ['ES2023'] });
const unchecked = typedCases('nitpicker-extreme-unchecked-', {
  lib: ['ES2023'],
  noUncheckedIndexedAccess: true,
});
afterAll(() => {
  cleanup();
  unchecked.cleanup();
});

const COPY = '[...rows]';
const SMALLEST = reduced(COPY, { less: 'a.t - b.t < 0' });
const NEWEST = reduced(COPY, { less: 'a.t - b.t < 0', end: 'last' });
const BY_NAME = { a: 'candidate', b: 'best', less: 'candidate < best' };
const BY_TIME = { a: 'candidate', b: 'best', less: 'byTime(candidate, best) < 0' };

const FIXES: FixCase[] = [
  rowsFix(`${COPY}.sort((a, b) => a.t - b.t)[0]?.id`, `${SMALLEST}?.id`),
  rowsFix(`${COPY}.sort((a, b) => a.t - b.t)['0']?.id`, `${SMALLEST}?.id`),
  rowsFix(`${COPY}.sort((a, b) => a.t - b.t).at(0)`, SMALLEST),
  rowsFix(`${COPY}.sort((a, b) => a.t - b.t).shift()`, SMALLEST),
  rowsFix(`${COPY}.sort((a, b) => a.t - b.t).at(-1)`, NEWEST),
  rowsFix(`${COPY}.sort((a, b) => a.t - b.t).pop()`, NEWEST),
  rowsFix(`${COPY}.sort((a, b) => { return a.t - b.t; }).pop()`, NEWEST),
  rowsFix(`${COPY}.sort((a, b) => b.t - a.t).at(0)`, reduced(COPY, { less: 'b.t - a.t < 0' })),
  rowsFix(
    'rows.slice().sort((a, b) => b.at.localeCompare(a.at))[0]?.id',
    `${reduced('rows.slice()', { less: 'b.at.localeCompare(a.at) < 0' })}?.id`,
  ),
  rowsFix(
    'rows.filter((r) => r.t > 0).sort((x, y) => x.d.getTime() - y.d.getTime()).at(-1)',
    reduced('rows.filter((r) => r.t > 0)', {
      a: 'x',
      b: 'y',
      less: 'x.d.getTime() - y.d.getTime() < 0',
      end: 'last',
    }),
  ),
  rowsFix(
    'rows.map((r) => r).sort((a, b) => a.t - b.t || a.id.localeCompare(b.id)).at(0)',
    reduced('rows.map((r) => r)', { less: '(a.t - b.t || a.id.localeCompare(b.id)) < 0' }),
  ),
  rowsFix(`${COPY}.sort(byTime)[0]?.id`, `${reduced(COPY, BY_TIME)}?.id`),
  rowsFix(`${COPY}.sort(byTime).at(-1)`, reduced(COPY, { ...BY_TIME, end: 'last' })),
  rowsFix('rows.toSorted((a, b) => a.t - b.t).at(0)', reduced('rows', { less: 'a.t - b.t < 0' })),
  rowsFix(
    'rows.toSorted((a, b) => a.t - b.t).at(-1)',
    reduced('rows', { less: 'a.t - b.t < 0', end: 'last' }),
  ),
  rowsFix(
    'Object.values(rows).sort((a, b) => a.t - b.t).at(0)',
    reduced('Object.values(rows)', { less: 'a.t - b.t < 0' }),
  ),
  fixed('numbers', 'levels: number[]', {
    code: 'levels.map((level) => level + 1).sort((a, b) => b - a)[0]?.toFixed()',
    output: `${reduced('levels.map((level) => level + 1)', { less: 'b - a < 0', type: 'number' })}?.toFixed()`,
  }),
  fixed('names', 'names: string[]', {
    code: '[...names].sort().at(0)',
    output: reduced('[...names]', { ...BY_NAME, type: 'string' }),
  }),
  fixed('names', 'names: string[]', {
    code: 'names.toSorted().pop()',
    output: reduced('names', { ...BY_NAME, type: 'string', end: 'last' }),
  }),
];

const row = (t: number, id: string) => ({ t, id, at: String(t % 3), d: new Date(t) });
const SAMPLES: Record<Kind, unknown[][]> = {
  rows: [
    [],
    [row(1, 'a')],
    [row(2, 'a'), row(1, 'b'), row(1, 'c'), row(2, 'd'), row(1, 'e')],
    [row(3, 'a'), row(3, 'b'), row(3, 'c')],
    [row(5, 'z'), row(4, 'y'), row(3, 'x'), row(2, 'w')],
  ],
  names: [[], ['b'], ['b', 'a', 'a', 'c'], ['10', '9', '1']],
  numbers: [[], [3], [2, 2, 5, 1, 5], [-1, 0, -1]],
};

function runOf(source: string): (input: unknown) => unknown {
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const exported: { f?: (input: unknown) => unknown } = {};
  vm.runInNewContext(outputText, { exports: exported });
  return (input) => exported.f?.(input);
}

const suggested = (test: FixCase) => ({
  ...typed(test.code),
  errors: [
    {
      messageId: 'sortForExtreme',
      suggestions: [{ messageId: 'useReduce', output: test.output }],
    },
  ],
});

tester.run('no-costly-collection-form reduce suggestion', rule, {
  valid: [],
  invalid: FIXES.map(suggested),
});

describe('the reduce suggestion', () => {
  it.each(FIXES.map((test) => [test.code, test] as const))(
    'returns what the sort returned: %s',
    (_code, test) => {
      const resultsOf = (run: (input: unknown) => unknown) =>
        SAMPLES[test.kind].map((sample) => JSON.stringify(run(structuredClone(sample))));
      expect(resultsOf(runOf(test.output))).toEqual(resultsOf(runOf(test.code)));
    },
  );
});

tester.run('no-costly-collection-form reduce suggestion of a split string', rule, {
  valid: [],
  invalid: [
    {
      ...typed(wrapped('text: string', "text.split(',').sort().at(0)")),
      errors: [
        {
          messageId: 'sortForExtreme',
          suggestions: [
            {
              messageId: 'useReduce',
              output: wrapped(
                'text: string',
                reduced("text.split(',')", { ...BY_NAME, type: 'string' }),
              ),
            },
          ],
        },
      ],
    },
    {
      ...typed(wrapped('rows: Row[]', 'rows.concat([]).sort(byTime).at(0)')),
      errors: [
        {
          messageId: 'sortForExtreme',
          suggestions: [
            {
              messageId: 'useReduce',
              output: wrapped('rows: Row[]', reduced('rows.concat([])', BY_TIME)),
            },
          ],
        },
      ],
    },
  ],
});

unchecked.tester.run('no-costly-collection-form reduce suggestion with unchecked indexes', rule, {
  valid: [],
  invalid: [
    {
      ...unchecked.typed(wrapped('rows: Row[]', `${COPY}.sort((a, b) => a.t - b.t)[0]`)),
      errors: [
        {
          messageId: 'sortForExtreme',
          suggestions: [{ messageId: 'useReduce', output: wrapped('rows: Row[]', SMALLEST) }],
        },
      ],
    },
    {
      ...unchecked.typed(
        `${HEAD}export function f(rows: Row[]) { const [first] = ${COPY}.sort(byTime); return first; }`,
      ),
      errors: [
        {
          messageId: 'sortForExtreme',
          suggestions: [
            {
              messageId: 'useReduce',
              output: `${HEAD}export function f(rows: Row[]) { const first = ${reduced(COPY, BY_TIME)}; return first; }`,
            },
          ],
        },
      ],
    },
  ],
});

typescriptRuleTester().run('no-costly-collection-form reduce suggestion without types', rule, {
  valid: [],
  invalid: [
    {
      code: 'export function f(rows: Row[]) { return [...rows].sort((a, b) => a.t - b.t).at(0); }',
      errors: [{ messageId: 'sortForExtreme' }],
    },
  ],
});
