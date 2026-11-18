import { describe, expect, it } from 'vitest';
import type { CoverageUnit, FunctionUnit } from '../../../ingest/units/unit-types.mts';
import { selectKotlinMethods } from '../kotlin-metrics.mts';

const COUNTS = { covered: 0, total: 0 };

function unit(name: string, start: number, end: number, lambda = false): FunctionUnit {
  const base = {
    ccn: 1,
    file: 'A.kt',
    longName: name,
    name,
    start,
    end,
    lineScoped: false,
    lineFallback: false,
    numberedAmongSameSource: false,
  };
  return { ...base, lambda };
}

function methodOf(name: string, line: number, className = 'demo/Demo'): CoverageUnit {
  return { name, line, className, lines: COUNTS, branches: COUNTS };
}

describe('selectKotlinMethods', () => {
  const fn = unit('Demo.run', 10, 20);
  const method = (name: string, line: number) => methodOf(name, line);

  it('takes the methods that start inside the function', () => {
    const selected = selectKotlinMethods(
      fn,
      [method('run', 10), method('run$lambda$0', 15), method('other', 21), method('before', 9)],
      [fn],
    );

    expect(selected.map(({ name }) => name)).toEqual(['run', 'run$lambda$0']);
  });

  it('leaves the synthetic method of a lambda to the lambda unit', () => {
    const lambda = unit('Demo.run.<lambda>', 14, 16, true);
    const methods = [method('run', 10), method('run$lambda$0', 15)];

    expect(selectKotlinMethods(fn, methods, [fn, lambda]).map(({ name }) => name)).toEqual(['run']);
    expect(selectKotlinMethods(lambda, methods, [fn, lambda]).map(({ name }) => name)).toEqual([
      'run$lambda$0',
    ]);
  });

  it('keeps the method of a function whose first line is the line of a lambda inside it', () => {
    const oneLine = unit('Demo.bump', 10, 12);
    const lambda = unit('Demo.bump.<lambda>', 11, 11, true);
    const methods = [method('bump', 11), method('bump$lambda$0', 11)];

    expect(
      selectKotlinMethods(oneLine, methods, [oneLine, lambda]).map(({ name }) => name),
    ).toEqual(['bump']);
    expect(selectKotlinMethods(lambda, methods, [oneLine, lambda]).map(({ name }) => name)).toEqual(
      ['bump$lambda$0'],
    );
  });

  it('leaves out the synthetic default-argument bridge', () => {
    const selected = selectKotlinMethods(fn, [method('run', 10), method('run$default', 10)], [fn]);

    expect(selected.map(({ name }) => name)).toEqual(['run']);
  });

  it('counts a static bridge of a companion function once, through the method that holds the code', () => {
    const bridge = methodOf('make', 12, 'demo/Holder');
    const body = methodOf('make', 12, 'demo/Holder$Companion');

    expect(selectKotlinMethods(fn, [bridge, body], [fn])).toEqual([body]);
    expect(
      selectKotlinMethods(fn, [bridge, { ...bridge, name: 'other' }, body], [fn]).map(
        ({ name }) => name,
      ),
    ).toEqual(['other', 'make']);
  });

  it('keeps the overloads a function has in one class', () => {
    const overloads = [methodOf('over', 11, 'demo/EdgeKt'), methodOf('over', 11, 'demo/EdgeKt')];

    expect(selectKotlinMethods(fn, overloads, [fn])).toEqual(overloads);
  });

  it('leaves the methods of a function nested inside to that function', () => {
    const inner = unit('Demo.run.inner', 14, 16);

    expect(
      selectKotlinMethods(fn, [method('outer', 10), method('inner', 14)], [fn, inner]).map(
        ({ name }) => name,
      ),
    ).toEqual(['outer']);
    expect(selectKotlinMethods(inner, [method('inner', 14)], [fn, inner])).toHaveLength(1);
  });
});
