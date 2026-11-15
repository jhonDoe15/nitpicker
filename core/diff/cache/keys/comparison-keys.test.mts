import { describe, expect, it } from 'vitest';
import { type ComparisonScope, withComparisonKeys } from './comparison-keys.mts';
import { fieldOf } from '../../../../shared/values/readers.mts';

const comparison: ComparisonScope = { touchedPaths: ['a.txt'], headRoot: '/head', quick: false };

describe('comparison keys', () => {
  it('keys an analyzer apart by what its comparison key returns', () => {
    const seen: ComparisonScope[] = [];
    const keyed = {
      name: 'keyed',
      configurationHash: 'config',
      resolveConfigurationHash: (root: string) => `config:${root}`,
      comparisonKey: (context: ComparisonScope) => {
        seen.push(context);
        return 'tests';
      },
    };
    const [candidate] = withComparisonKeys([keyed], comparison);
    const result = {
      configurationHash: fieldOf(candidate, 'configurationHash'),
      resolveConfigurationHash: (root: string): unknown => {
        const resolve = fieldOf(candidate, 'resolveConfigurationHash');
        return typeof resolve === 'function'
          ? Reflect.apply(resolve, undefined, [root])
          : undefined;
      },
    };

    expect(seen).toEqual([comparison]);
    expect(result.configurationHash).toMatch(/^[0-9a-f]{64}$/u);
    expect(result.resolveConfigurationHash('/policy')).not.toBe('config:/policy');
    expect(result.resolveConfigurationHash('/policy')).not.toBe(result.configurationHash);
    expect(
      withComparisonKeys([{ ...keyed, comparisonKey: () => 'other' }], comparison)[0],
    ).not.toEqual(expect.objectContaining({ configurationHash: result.configurationHash }));
  });

  it('leaves an analyzer without a key, or whose key is undefined, as it is', () => {
    const plain = { name: 'plain', configurationHash: 'config' };
    const unkeyed = {
      name: 'unkeyed',
      configurationHash: 'config',
      comparisonKey: () => undefined,
    };

    const result = withComparisonKeys([plain, unkeyed], comparison);

    expect(result[0]).toBe(plain);
    expect(result[1]).toBe(unkeyed);
  });
});
