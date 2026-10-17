import { describe, expect, it } from 'vitest';
import { selectKotlinMethods } from '../kotlin-metrics.mjs';

describe('selectKotlinMethods', () => {
  const fn = { name: 'Demo.run', start: 10, end: 20 };
  const method = (name, line) => ({ name, line });

  it('takes the methods that start inside the function', () => {
    const selected = selectKotlinMethods(
      fn,
      [method('run', 10), method('run$lambda$0', 15), method('other', 21), method('before', 9)],
      [fn],
    );

    expect(selected.map(({ name }) => name)).toEqual(['run', 'run$lambda$0']);
  });

  it('leaves the synthetic method of a lambda to the lambda unit', () => {
    const lambda = { name: 'Demo.run.<lambda>', start: 14, end: 16, lambda: true };
    const methods = [method('run', 10), method('run$lambda$0', 15)];

    expect(selectKotlinMethods(fn, methods, [fn, lambda]).map(({ name }) => name)).toEqual(['run']);
    expect(selectKotlinMethods(lambda, methods, [fn, lambda]).map(({ name }) => name)).toEqual([
      'run$lambda$0',
    ]);
  });

  it('keeps the method of a function whose first line is the line of a lambda inside it', () => {
    const oneLine = { name: 'Demo.bump', start: 10, end: 12 };
    const lambda = { name: 'Demo.bump.<lambda>', start: 11, end: 11, lambda: true };
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
    const bridge = { name: 'make', line: 12, className: 'demo/Holder' };
    const body = { name: 'make', line: 12, className: 'demo/Holder$Companion' };

    expect(selectKotlinMethods(fn, [bridge, body], [fn])).toEqual([body]);
    expect(
      selectKotlinMethods(fn, [bridge, { ...bridge, name: 'other' }, body], [fn]).map(
        ({ name }) => name,
      ),
    ).toEqual(['other', 'make']);
  });

  it('keeps the overloads a function has in one class', () => {
    const overloads = [
      { name: 'over', line: 11, className: 'demo/EdgeKt' },
      { name: 'over', line: 11, className: 'demo/EdgeKt' },
    ];

    expect(selectKotlinMethods(fn, overloads, [fn])).toEqual(overloads);
  });

  it('leaves the methods of a function nested inside to that function', () => {
    const inner = { name: 'Demo.run.inner', start: 14, end: 16 };

    expect(
      selectKotlinMethods(fn, [method('outer', 10), method('inner', 14)], [fn, inner]).map(
        ({ name }) => name,
      ),
    ).toEqual(['outer']);
    expect(selectKotlinMethods(inner, [method('inner', 14)], [fn, inner])).toHaveLength(1);
  });
});
