import { describe, expect, it } from 'vitest';
import { failureMessagesFor } from '../failure-messages/harness.mjs';
import { forEachSelectors, loopSelectors } from './strict-control-flow.mjs';
import strictSyntaxConfig, { restrictedSyntaxByScope } from './strict.mjs';

const asserted = 'export const value = input as string;';
const loop = 'export function run(items) { for (const item of items) { use(item); } }';
const thenChain = 'export function run(task) { return task.then(use); }';
const defaultExport = 'export default function run() {}';

function messages(code, filename) {
  return failureMessagesFor({ config: strictSyntaxConfig, filename, code });
}

describe('no-restricted-syntax lists are unified across scopes', () => {
  it('applies the global and the domain-scoped bans to a domain file', () => {
    const file = 'src/main/features/x/domain/run.ts';

    expect(messages(`${asserted}\n${loop}\n`, file)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Do not assert with `as`'),
        expect.stringContaining('domain/ code has no loops'),
      ]),
    );
    expect(messages(defaultExport, file)).toEqual([expect.stringContaining('Use a named export')]);
  });

  it('applies the global and the adapters-scoped bans to an adapters file', () => {
    const file = 'src/main/features/x/adapters/run.ts';

    expect(messages(`${asserted}\n${thenChain}\n`, file)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Do not assert with `as`'),
        expect.stringContaining('Use async/await'),
      ]),
    );
    expect(messages(defaultExport, file)).toEqual([expect.stringContaining('Use a named export')]);
  });

  it('applies the control-flow bans to shared and plain source files, not to tests', () => {
    for (const file of ['src/main/shared/run.ts', 'src/run.ts', 'src/main/features/x/service.ts']) {
      expect(messages('export function run() { while (more()) { step(); } }', file)).toEqual([
        expect.stringContaining('for...of is the only loop'),
      ]);
      expect(messages(thenChain, file)).toEqual([expect.stringContaining('Use async/await')]);
      expect(messages('export const same = a == b;', file)).toEqual([
        expect.stringContaining("'==='"),
      ]);
      expect(messages(loop, file)).toEqual([]);
    }
    expect(messages('export function run() { while (more()) {} }', 'src/run.test.ts')).toEqual([
      expect.stringContaining('No matching configuration'),
    ]);
  });

  it('bans self-recursion in every production file, not in tests', () => {
    const recursive = 'export function retry(n) { return n > 0 ? retry(n - 1) : 0; }';

    for (const file of [
      'src/main/features/x/domain/run.ts',
      'src/main/features/x/adapters/run.ts',
      'src/main/composition-root.ts',
      'src/main/shared/run.ts',
    ]) {
      expect(messages(recursive, file)).toEqual([expect.stringContaining("'retry' calls itself")]);
    }
    expect(messages(recursive, 'src/run.test.ts')).toEqual([
      expect.stringContaining('No matching configuration'),
    ]);
  });

  it('reports a domain loop or forEach once, with the domain message', () => {
    const file = 'src/main/features/x/domain/run.ts';

    expect(messages('export function run() { while (more()) {} }', file)).toEqual([
      expect.stringContaining('domain/ code has no loops'),
    ]);
    expect(messages('export function run(xs) { xs.forEach(use); }', file)).toEqual([
      expect.stringContaining('domain/ code does not use forEach'),
    ]);
  });

  it('gives every scope the complete list of the scopes it is nested in', () => {
    const { source, domain, adapters, configFile } = restrictedSyntaxByScope;

    const replacedByDomain = [...loopSelectors, ...forEachSelectors];

    expect(domain).toEqual(
      expect.arrayContaining(source.filter((selector) => !replacedByDomain.includes(selector))),
    );
    expect(adapters).toEqual(expect.arrayContaining(source));
    expect(source).toEqual(expect.arrayContaining(configFile));
    expect(domain.length).toBeGreaterThan(source.length);
    expect(adapters.length).toBeGreaterThan(source.length);
  });

  it('configures exactly one duplicate-free list per scope', () => {
    const lists = strictSyntaxConfig
      .filter((entry) => entry.rules?.['no-restricted-syntax'] !== undefined)
      .map((entry) => entry.rules['no-restricted-syntax'].slice(1));

    expect(lists).toHaveLength(4);
    for (const selectors of lists) {
      expect(new Set(selectors).size).toBe(selectors.length);
    }
  });
});
