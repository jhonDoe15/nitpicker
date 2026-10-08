import { describe, expect, it } from 'vitest';
import { failureMessagesFor } from '../failure-messages/harness.mjs';
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

  it('keeps the scoped bans out of other source files', () => {
    expect(messages(loop, 'src/main/shared/run.ts')).toEqual([]);
    expect(messages(thenChain, 'src/main/features/x/service.ts')).toEqual([]);
  });

  it('gives every scope the complete list of the scopes it is nested in', () => {
    const { source, domain, adapters, configFile } = restrictedSyntaxByScope;

    expect(domain).toEqual(expect.arrayContaining(source));
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
