import { describe, expect, it } from 'vitest';
import { accumulatingSpreadCheck, accumulatingSpreadReport } from './accumulating-spread-check.mts';

const REDUCE = 'Do not spread accumulators in Array.prototype.reduce()';
const LOOP = 'Do not spread accumulators in loops';

function spreadAt(offset: number) {
  return [
    { label: 'From this spread', span: { offset, length: 6 } },
    { label: 'For this reduce', span: { offset: 0, length: 9 } },
  ];
}

describe('accumulatingSpreadReport', () => {
  it.each([
    [REDUCE, "It looks like you're spreading an `Object`. Consider using …", 'reduceObject', true],
    [REDUCE, "It looks like you're spreading an `Array`. Consider using …", 'reduceArray', true],
    [REDUCE, 'Consider using `Object.assign()` or `Array.prototype.push()` …', 'reduce', true],
    [
      LOOP,
      'Consider using `Object.assign()` to mutate the accumulator instead.',
      'loopObject',
      false,
    ],
    [LOOP, 'Consider using `Array.prototype.push()` to mutate …', 'loopArray', false],
  ])('reads "%s" with help "%s" as %s', (message, help, messageId, reducer) => {
    const diagnostic = {
      filename: 'a.ts',
      code: 'oxc(no-accumulating-spread)',
      message,
      help,
      labels: spreadAt(23),
    };
    expect(accumulatingSpreadReport(diagnostic, 'src/main/features/a/adapters/a.ts')).toEqual({
      messageId,
      check: { reducer, spreadOffset: 23 },
    });
  });

  it('picks the domain/ message by path and reads a report without help as the general one', () => {
    const diagnostic = { filename: 'a.ts', message: REDUCE, labels: spreadAt(4) };
    expect(accumulatingSpreadReport(diagnostic, 'src/main/features/a/domain/a.ts').messageId).toBe(
      'domainReduce',
    );
    expect(
      accumulatingSpreadReport(
        { ...diagnostic, message: LOOP },
        'src\\main\\features\\a\\domain\\a.ts',
      ).messageId,
    ).toBe('domainLoopArray');
  });

  it('fails loudly when oxlint stops labelling the spread', () => {
    const diagnostic = {
      filename: 'a.ts',
      code: 'oxc(no-accumulating-spread)',
      message: REDUCE,
      labels: [],
    };
    expect(() => accumulatingSpreadReport(diagnostic, 'src/a.ts')).toThrow(
      `oxlint's oxc(no-accumulating-spread) report has no "From this spread" label`,
    );
  });
});

function kept(
  code: string,
  column: number,
  {
    reducer = true,
    line = 1,
    filePath = 'src/a.ts',
  }: { reducer?: boolean; line?: number; filePath?: string } = {},
) {
  return spansOf(code, column, { reducer, line, filePath }).length > 0;
}

function spansOf(
  code: string,
  column: number,
  { reducer = false, line = 1, filePath = 'src/a.ts' } = {},
) {
  return accumulatingSpreadCheck(
    filePath,
    code,
  )({
    ruleId: 'oxc(no-accumulating-spread)',
    reducer,
    spread: { line, column },
  });
}

describe('accumulatingSpreadCheck for reduce reports', () => {
  it.each([
    ['xs.reduce((acc, x) => [...acc, x], []);', 24, true],
    ['xs.reduce(((acc, x) => [...acc, x]), []);', 25, true],
    ["xs?.['reduceRight'](function (acc, x) { return { ...acc, x }; });", 50, false],
    ["xs?.['reduceRight'](function (acc, x) { return { ...acc, [x]: 1 }; });", 50, true],
    ['xs.reduce((acc, x) => [...acc, x], [], extra);', 24, false],
    ['xs.map((acc, i) => [...acc]).reduce((a, b) => a, []);', 21, false],
    ['xs.reduce((a, b) => a, ys.map((acc, i) => [...acc]));', 44, false],
    ['xs.reduce((a, b) => { const f = (acc, y) => [...acc, y]; return f(a, b); }, []);', 46, false],
    ['xs.reduce(step(), [...seed]);', 24, false],
    ['xs.#reduce((acc, x) => [...acc, x], []);', 25, false],
    ['xs.reduce((acc, x) => [...acc, x], []);', 3, false],
  ])('in %s the spread at column %i is reported: %s', (code, column, reported) => {
    expect(kept(code, column)).toBe(reported);
  });

  it('parses JSX files as JSX', () => {
    const code = 'export const a = xs.reduce((acc, x) => [...acc, <b key={x} />], []);';
    expect(kept(code, 41, { filePath: 'src/a.tsx' })).toBe(true);
  });

  it('finds a line-1 spread after a byte order mark', () => {
    expect(kept('﻿xs.reduce((acc, x) => [...acc, x], []);', 24)).toBe(true);
  });
});

describe('accumulatingSpreadCheck for accumulators that cannot grow', () => {
  it.each([
    ['xs.reduce((acc, x) => ({ ...acc, paid: acc.paid + x.v }), { paid: 0, open: 0 });', 26, false],
    ["xs.reduce((acc, x) => ({ ...acc, 'paid': 1, open() { return 0; } }), {});", 26, false],
    ['xs.reduce((acc, x) => ({ ...acc, [x.id]: x }), {});', 26, true],
    ['xs.reduce((acc, x) => ({ ...acc, ...x }), {});', 26, true],
    ['xs.reduce((acc, x) => [...acc, x].slice(-3), []);', 24, false],
    ['xs.reduce((acc, x) => [...acc, x].slice(0, 3), []);', 24, false],
    ['xs.reduce((acc, x) => ([...acc, x]).slice(-3), []);', 25, false],
    ['xs.reduce((acc, x) => [...acc, x].slice(1), []);', 24, true],
    ['xs.reduce((acc, x) => [...acc, x].slice(-n), []);', 24, true],
    ['xs.reduce((acc, x) => [...acc, x].slice(0, n), []);', 24, true],
    ['xs.reduce((acc, x) => [...acc, x][`slice`](-3), []);', 24, true],
  ])('in %s the spread at column %i is reported: %s', (code, column, reported) => {
    expect(kept(code, column)).toBe(reported);
  });

  it('applies the same bounds to loop accumulators', () => {
    const loop = (next: string) => `let out = [];\nfor (const x of xs) {\n  out = ${next};\n}`;
    expect(kept(loop('[...out, x].slice(-3)'), 10, { reducer: false, line: 3 })).toBe(false);
    expect(kept(loop('[...out, x]'), 10, { reducer: false, line: 3 })).toBe(true);
  });
});

describe('accumulatingSpreadCheck for loop accumulators', () => {
  const body = (...lines: string[]) =>
    ['let out = [];', 'for (const x of xs) {', ...lines.map((line) => `  ${line}`), '}'].join('\n');
  const spread = (line: number, column: number) => ({
    line,
    column,
    endLine: line,
    endColumn: column + 6,
  });
  const first = { reducer: false, line: 3, filePath: 'src/a.ts' };

  it('reports every write that spreads the accumulator into itself', () => {
    const code = `${body('out = [...out, x];')}\nfor (const y of ys) {\n  out = [...out, y];\n}`;
    expect(spansOf(code, 10, first)).toEqual([spread(3, 10), spread(6, 10)]);
  });

  it('reports the first spread of a write and skips writes that stay the same size', () => {
    const code = body('out = [...out, x, ...out];', 'out = [...out, x].slice(-3);');
    expect(spansOf(code, 10, first)).toEqual([]);
    expect(spansOf(body('out = [...out, x, ...out];'), 10, first)).toEqual([spread(3, 10)]);
  });

  it.each([
    body('out = [...out, x];', 'out = [];'),
    body('out = [...out, x];', 'out = out.filter(keep);'),
    body('out = [...out, x];', 'out += 1;'),
    body('out = [...out, x];', 'out++;'),
    body('out = [...out, x];', '[out] = [[]];'),
    body('out = [...out, x];', 'const reset = () => { out = []; };'),
    `${body('out = [...out, x];')}\nout = [];`,
    `${body('out = [...out, x];')}\nfor (out of xs) {}`,
  ])('skips an accumulator that is also written another way: %s', (code) => {
    expect(spansOf(code, 10, first)).toEqual([]);
  });

  it.each([
    'out.length = 0;',
    'out[0] = 1;',
    'cnt[out.length] = 1;',
    'out.extra = 1;',
    'out.length++;',
    '[out.extra] = [1];',
    'for (out.extra of xs) {}',
  ])('keeps reporting when the accumulator is only a member target: %s', (statement) => {
    expect(spansOf(body('out = [...out, x];', statement), 10, first)).toEqual([spread(3, 10)]);
    expect(spansOf(`${body('out = [...out, x];')}\n${statement}`, 10, first)).toEqual([
      spread(3, 10),
    ]);
  });

  it('reports a spread write whose accumulator a closure only reads or a block shadows', () => {
    const closure = body('out = [...out, x];', 'const peek = () => out;');
    expect(spansOf(closure, 10, first)).toEqual([spread(3, 10)]);
    const shadowed = body('out = [...out, x];', 'const f = (out) => { out = []; };');
    expect(spansOf(shadowed, 10, first)).toEqual([spread(3, 10)]);
  });

  it('skips writes outside a loop, var and const accumulators and parenthesized spreads', () => {
    expect(spansOf('let out = [];\nout = [...out, 1];', 7, { ...first, line: 2 })).toEqual([]);
    expect(spansOf(body('out = [...out, x];').replace('let', 'var'), 10, first)).toEqual([]);
    expect(spansOf(body('out = [...(out), x];'), 11, first)).toEqual([]);
  });
});
