import type { DependencyType } from 'dependency-cruiser';
import { outsideRootsRule as untypedOutsideRootsRule } from '../outside-roots/outside-roots.mjs';

export type ProductionSource = {
  readonly path: string;
  readonly pathNot?: string | string[];
};

export type OutsideRootsOptions = {
  readonly excludePattern?: string;
  readonly generatedFilePattern?: string;
};

type OutsideRootsRequest = {
  readonly productionSource: ProductionSource;
  readonly roots: readonly string[];
  readonly excludePattern: string | undefined;
  readonly generatedFilePattern: string | undefined;
};

type OutsideRootsRule = {
  readonly name: string;
  readonly severity: 'error';
  readonly comment: string;
  readonly from: ProductionSource;
  readonly to: { readonly pathNot: string; readonly dependencyTypesNot: DependencyType[] };
};

const rule: (request: OutsideRootsRequest) => unknown = untypedOutsideRootsRule;

function isOutsideRootsRule(value: unknown): value is OutsideRootsRule {
  return (
    typeof value === 'object' && value !== null && 'severity' in value && value.severity === 'error'
  );
}

export function outsideRootsRule(
  productionSource: ProductionSource,
  roots: readonly string[],
  { excludePattern, generatedFilePattern }: OutsideRootsOptions = {},
): OutsideRootsRule {
  const built = rule({ productionSource, roots, excludePattern, generatedFilePattern });
  if (!isOutsideRootsRule(built)) {
    throw new TypeError('outsideRootsRule returned an unexpected shape');
  }
  return built;
}
