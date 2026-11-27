import { describe, expect, it } from 'vitest';
import {
  oneVersionEach,
  ranInsideVitest,
  type ScriptCoverage,
  vitestScriptsOnly,
  vitestScriptsProvider,
} from './coverage-provider.mts';

function script(url: string, startOffset: number, ...ranges: [number, number][]): ScriptCoverage {
  return {
    url,
    startOffset,
    functions: ranges.map(([start, end]) => ({
      ranges: [{ startOffset: start, endOffset: end }],
    })),
  };
}

const wrapped = script('file:///a.mts', 120, [0, 3589], [13, 3589], [246, 289]);
const native = script('file:///a.mts', 120, [0, 1082], [776, 1015]);
const other = script('file:///b.mts', 120, [0, 900], [13, 900]);

describe('ranInsideVitest', () => {
  it('keeps a module Vitest ran inside its wrapper function', () => {
    expect(ranInsideVitest(wrapped)).toBe(true);
  });

  it('drops a copy of the module that Node loaded itself under the same URL', () => {
    expect(ranInsideVitest(native)).toBe(false);
  });

  it('drops a module without a wrapper offset, even when a function spans it', () => {
    expect(ranInsideVitest(script('file:///c.mts', 0, [0, 500], [0, 500]))).toBe(false);
  });

  it('drops a function that ends with the module but starts after the wrapper', () => {
    expect(ranInsideVitest(script('file:///c.mts', 120, [0, 500], [200, 500]))).toBe(false);
  });

  it('drops a script without functions', () => {
    expect(ranInsideVitest(script('file:///c.mts', 120))).toBe(false);
  });
});

describe('oneVersionEach', () => {
  it('keeps every run of a module when all of them ran the same code', () => {
    expect(oneVersionEach([wrapped, other, wrapped])).toEqual([wrapped, other, wrapped]);
  });

  it('drops a module that ran as two different codes under one URL', () => {
    const nested = script('file:///a.mts', 120, [0, 3600], [13, 3600]);
    expect(oneVersionEach([wrapped, other, nested])).toEqual([other]);
  });
});

describe('vitestScriptsOnly', () => {
  it('keeps only the scripts Vitest ran, and the other fields of the coverage', () => {
    expect(vitestScriptsOnly({ result: [native, wrapped], extra: 1 })).toEqual({
      result: [wrapped],
      extra: 1,
    });
  });

  it('passes on what is not coverage unchanged', () => {
    expect(vitestScriptsOnly(null)).toBeNull();
  });
});

describe('vitestScriptsProvider', () => {
  const provider = vitestScriptsProvider({
    takeCoverage: () => Promise.resolve({ result: [wrapped, native] }),
    getProvider: () => ({ name: 'v8' }),
  });

  it('takes the V8 coverage of the scripts Vitest ran', async () => {
    await expect(provider.takeCoverage?.()).resolves.toEqual({ result: [wrapped] });
  });

  it('names the V8 provider custom, so the test workers load this module', async () => {
    await expect(provider.getProvider()).resolves.toEqual({ name: 'custom' });
  });
});
