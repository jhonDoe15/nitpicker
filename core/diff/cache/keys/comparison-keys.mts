import { createHash } from 'node:crypto';
import { fieldOf, textOf } from '../../../../shared/values/readers.mts';

export type ComparisonScope = {
  readonly touchedPaths: readonly string[];
  readonly headRoot: string;
  readonly quick: boolean;
};

type Resolver = (value: unknown) => unknown;

function isResolver(value: unknown): value is Resolver {
  return typeof value === 'function';
}

function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null;
}

function keyedHash(configurationHash: unknown, key: unknown): string {
  return createHash('sha256')
    .update(`${textOf(configurationHash)}\0comparison\0${textOf(key)}`)
    .digest('hex');
}

function resolvedHash(resolve: unknown, root: unknown): unknown {
  if (!isResolver(resolve)) {
    throw new TypeError('resolveConfigurationHash is not a function');
  }
  return resolve(root);
}

function keyedAnalyzer(analyzer: object, key: unknown): object {
  const resolveConfigurationHash = fieldOf(analyzer, 'resolveConfigurationHash');
  return {
    ...analyzer,
    configurationHash: keyedHash(fieldOf(analyzer, 'configurationHash'), key),
    ...(resolveConfigurationHash === undefined
      ? {}
      : {
          resolveConfigurationHash: (root: unknown) =>
            keyedHash(resolvedHash(resolveConfigurationHash, root), key),
        }),
  };
}

function comparisonKeyOf(analyzer: unknown, comparison: ComparisonScope): unknown {
  const comparisonKey = fieldOf(analyzer, 'comparisonKey');
  return isResolver(comparisonKey) ? comparisonKey.call(analyzer, comparison) : undefined;
}

export function withComparisonKeys(
  analyzers: readonly unknown[],
  comparison: ComparisonScope,
): unknown[] {
  return analyzers.map((analyzer) => {
    const key = comparisonKeyOf(analyzer, comparison);
    return key === undefined || !isObject(analyzer) ? analyzer : keyedAnalyzer(analyzer, key);
  });
}
