import {
  expectedOutput19_54,
  expectedOutput25_43,
  expectedOutput31_59,
  expectedOutput37_43,
  expectedOutput42_86,
  expectedOutput45_41,
  expectedOutput46_61,
  expectedOutput51_88,
  expectedOutput65_41,
  expectedOutput67_52,
  expectedOutput75_75,
  expectedOutput78_76,
  expectedOutput88_20,
  expectedOutput91_22,
  expectedOutput92_20,
} from '../../../../../core/diff/fixtures/expected-output/languages-typescript-preset-eslint-config-strict-scopes.mjs';
import { describe, expect, it } from 'vitest';
import { failureMessagesFor } from '../../failure-messages/harness.mjs';
import strictSyntaxConfig, { restrictedSyntaxByScope } from '../strict.config.mjs';

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

    expect([...new Set(messages(`${asserted}\n${loop}\n`, file))].sort()).toEqual(
      expectedOutput19_54(),
    );
    expect(messages(defaultExport, file)).toEqual(expectedOutput25_43());
  });

  it('applies the global and the adapters-scoped bans to an adapters file', () => {
    const file = 'src/main/features/x/adapters/run.ts';

    expect([...new Set(messages(`${asserted}\n${thenChain}\n`, file))].sort()).toEqual(
      expectedOutput31_59(),
    );
    expect(messages(defaultExport, file)).toEqual(expectedOutput37_43());
  });

  it('applies the control-flow bans to shared and plain source files, not to tests', () => {
    for (const file of ['src/main/shared/run.ts', 'src/run.ts', 'src/main/features/x/service.ts']) {
      expect(messages('export function run() { while (more()) { step(); } }', file)).toEqual(
        expectedOutput42_86(),
      );
      expect(messages(thenChain, file)).toEqual(expectedOutput45_41());
      expect(messages('export const same = a == b;', file)).toEqual(expectedOutput46_61());
      expect(messages(loop, file)).toEqual([]);
    }
    expect(messages('export function run() { while (more()) {} }', 'src/run.test.ts')).toEqual(
      expectedOutput51_88(),
    );
  });

  it('bans self-recursion in every production file, not in tests', () => {
    const recursive = 'export function retry(n) { return n > 0 ? retry(n - 1) : 0; }';

    for (const file of [
      'src/main/features/x/domain/run.ts',
      'src/main/features/x/adapters/run.ts',
      'src/main/composition-root.ts',
      'src/main/shared/run.ts',
    ]) {
      expect(messages(recursive, file)).toEqual(expectedOutput65_41());
    }
    expect(messages(recursive, 'src/run.test.ts')).toEqual(expectedOutput67_52());
  });

  it('reports a domain loop or forEach once, with the domain message', () => {
    const file = 'src/main/features/x/domain/run.ts';

    expect(messages('export function run() { while (more()) {} }', file)).toEqual(
      expectedOutput75_75(),
    );
    expect(messages('export function run(xs) { xs.forEach(use); }', file)).toEqual(
      expectedOutput78_76(),
    );
  });

  it('gives every scope the complete list of the scopes it is nested in', () => {
    const { source, domain, adapters } = restrictedSyntaxByScope;

    expect(domain).toEqual(expectedOutput88_20());
    expect(adapters).toEqual(expectedOutput91_22());
    expect(source).toEqual(expectedOutput92_20());
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
