import { describe, expect, it } from 'vitest';
import { censusOf, entriesOf, isCensusFile } from './census.mts';

const SOURCE = `
import { save } from './store.mjs';
export function pick(flag) {
  if (flag === 'a') {
    return 1;
  }
  return 2;
}
export function label() {
  return 'fixed';
}
export function persist(item) {
  return save(item);
}
export const names = (items) => items.map((item) => item.name);
const LIMIT = 3;
`;

describe('flow-model census', () => {
  it('lists top-level function declarations and function-valued constants', () => {
    expect(entriesOf('sample.mjs', SOURCE).map(({ entry }) => entry)).toEqual([
      'pick',
      'label',
      'persist',
      'names',
    ]);
  });
  it('keeps production sources and leaves tests, fixtures and test support out', () => {
    expect(
      [
        'core/a.mjs',
        'core/a.test.mjs',
        'core/fixtures/b.mjs',
        'shared/test-support/c.mjs',
        'languages/x/e2e/d.mjs',
        'languages/java/java-e2e/e.mjs',
        'languages/java/maven/__tests__/f.mjs',
        'core/readme.md',
      ].filter(isCensusFile),
    ).toEqual(['core/a.mjs']);
  });
  it('separates gaps that contracts close from gaps that need new syntax', () => {
    const census = censusOf(entriesOf('sample.mjs', SOURCE));

    expect(census.entries).toBe(4);
    expect(census.errors).toBe(0);
    expect(census.classes).toEqual({ complete: 1, contractsOnly: 2, needsSyntax: 1 });
    expect(census.anyReason).toMatchObject({ 'unknown-call': 2, 'unknown-guard': 1 });
    expect(census.unsupportedSyntax).toEqual({ ArrowFunction: 1 });
    expect(census.firstReason).toEqual({ 'unknown-call': 2, 'unknown-guard': 1 });
  });
  it('counts each reason once per function and keeps dispatch among contract gaps', () => {
    const source = `
import { load, store } from './io.mjs';
export function copy(item, target) {
  load(item);
  store(item);
  return target.write(item);
}
export function notify(handler) {
  return handler(1);
}
`;
    const census = censusOf(entriesOf('copy.mjs', source));

    expect(census.classes).toEqual({ contractsOnly: 2 });
    expect(census.anyReason).toMatchObject({ 'unknown-call': 1, 'unknown-dispatch': 1 });
  });
  it('counts a source the extractor rejects as an error, not a result', () => {
    const entries = [{ file: 'broken.mjs', text: 'function f( {', entry: 'f' }];

    expect(censusOf(entries)).toMatchObject({ entries: 1, errors: 1, classes: {} });
  });
});
