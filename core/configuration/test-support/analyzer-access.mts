import type { Analyzer, ProfiledAnalyzer } from '../../../shared/values/analyzers.mts';
import { fieldOf } from '../../../shared/values/readers.mts';

export function analyzerAt<T extends { readonly name: string }>(
  analyzers: readonly T[],
  index: number,
): T {
  const analyzer = analyzers[index];
  if (analyzer === undefined) {
    throw new Error(`no analyzer at ${String(index)}`);
  }
  return analyzer;
}

export function analyzerNamed<T extends { readonly name: string }>(
  analyzers: readonly T[],
  name: string,
): T {
  const found = analyzers.find((analyzer) => analyzer.name === name);
  if (found === undefined) {
    throw new Error(`no analyzer named ${name}`);
  }
  return found;
}

export function invocationArgs(
  analyzer: Analyzer | ProfiledAnalyzer | undefined,
  context: object,
): unknown {
  const create = fieldOf(analyzer, 'createInvocation');
  return typeof create === 'function'
    ? fieldOf(Reflect.apply(create, undefined, [context]), 'args')
    : undefined;
}

export function configurationHashOf(analyzer: ProfiledAnalyzer, root: string): unknown {
  return analyzer.resolveConfigurationHash?.(root);
}
