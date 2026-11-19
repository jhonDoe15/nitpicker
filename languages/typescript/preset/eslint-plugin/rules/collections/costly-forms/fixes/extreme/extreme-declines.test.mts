import { afterAll } from 'vitest';
import { typedCases } from '../../../../../test-support/typed-cases.mts';
import { rule } from '../../no-costly-collection-form.mts';
import { wrapped } from './extreme-cases.mts';

const { tester, cleanup, typed } = typedCases('nitpicker-extreme-declines-', { lib: ['ES2023'] });
afterAll(cleanup);

const COPY = '[...rows]';

function declines(body: string, params = 'rows: Row[]') {
  return { ...typed(wrapped(params, body)), errors: [{ messageId: 'sortForExtreme' }] };
}

function comparing(comparator: string, end = '.at(0)') {
  return declines(`${COPY}.sort(${comparator})${end}`);
}

tester.run('no-costly-collection-form reduce suggestion declines', rule, {
  valid: [],
  invalid: [
    declines(`${COPY}.sort(byTime)[0].id`),
    {
      ...typed(
        wrapped('rows: Row[]', '0').replace(
          'return 0;',
          `const [first] = ${COPY}.sort(byTime); return first;`,
        ),
      ),
      errors: [{ messageId: 'sortForExtreme' }],
    },
    comparing('(a, b) => a.t > b.t'),
    comparing('(a, b) => a.t - calls'),
    comparing('(a, b) => a.t - b.t - calls'),
    comparing('(a, b) => a.t * 2 - b.t'),
    comparing('(a, b) => { calls++; return a.t - b.t; }'),
    comparing('(a, b) => { const d = a.t - b.t; return d; }'),
    comparing('(a, b, c) => a.t - b.t'),
    comparing('(a) => a.t'),
    comparing('(a, b) => a.t - b.id.length'),
    comparing('(a, b) => a.id.length - b.t'),
    comparing('(a, b) => byTime(a, b)'),
    comparing('(a, b) => (a.t < b.t ? -1 : 1)'),
    comparing('(a, b) => a.tag?.length - b.tag?.length'),
    comparing('(a, b) => a.t - b.t || a.id.length - calls'),
    comparing("(a, b) => a.id.localeCompare(b.id, 'en')"),
    comparing('(a, b) => a.id.localeCompare()'),
    comparing('(a, b) => a.t - a.t'),
    comparing('function (a, b) { return a.t - b.t; }'),
    comparing('async (a, b) => a.t - b.t'),
    comparing('noisy'),
    comparing('byTime.bind(null)'),
    comparing('compareImported'),
    comparing('byTime, 1'),
    declines('repo.filter().sort(byTime).at(0)', 'repo: { filter(): Row[] }'),
    declines('repo.slice().sort(byTime).at(0)', 'repo: { slice(): Row[] }'),
    declines('repo.map().sort(byTime).at(0)', 'repo: { map(): Row[] }'),
    declines('repo.concat().sort(byTime).at(0)', 'repo: { concat(): Row[] }'),
    declines('repo.split().sort(byTime).at(0)', 'repo: { split(): Row[] }'),
    declines('repo.filter().sort(byTime).at(0)', 'repo: any'),
    declines('rows.filter().sort(byTime).at(0)', 'rows: Float64Array & { filter(): Row[] }'),
    declines('rows.sort((a, b) => a.t - b.t)[0]?.id'),
    declines('rows.sort(byTime).shift()'),
    declines('rows.sort(byTime).at(-1)'),
    declines(`${COPY}.sort(byTime).at(0)`, 'rows: (Row | undefined)[]'),
    declines(`${COPY}.sort(byTime).at(0)`, 'rows: any[]'),
    declines(`${COPY}.sort().at(0)`, 'rows: number[]'),
    declines(`${COPY}.sort().at(0)`, 'rows: Date[]'),
    declines(`${COPY}.sort().at(0)`, 'rows: (string | number)[]'),
    declines(`${COPY}.sort().at(0)`, 'rows: Row[]'),
    declines('rows.toSorted((a, b) => a - b).at(0)', 'rows: Float64Array'),
    declines('Float64Array.from(rows).sort().at(0)', 'rows: number[]'),
    declines('new Float64Array(rows).toSorted().at(0)', 'rows: number[]'),
    declines(`(${COPY} as Row[]).sort(byTime).at(0)`),
    declines(`${COPY} /* c */ .sort(byTime).at(0)`),
    declines(`${COPY}.sort(/* c */ byTime).at(0)`),
  ].filter((test) => test.code.length > 0),
});
