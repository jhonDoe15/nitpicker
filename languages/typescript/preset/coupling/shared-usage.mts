import { featureLayout } from '../architecture/strict-layout.mts';
import { normalizePath } from '../dependency-graph/cruise.mts';
import { isInsideRoot } from '../layout/source-root/root-paths.mts';
import type { DependencyGraph } from '../dependency-graph/graph-types.mts';
import type { SharedEntry, SharedImport } from './typed/coupling-types.mts';
import { featureRoles, sharedUsage } from './typed/rule-views.mts';

const roleOf = featureRoles(featureLayout);

export function sharedUsedByOneFeature(
  graph: DependencyGraph,
  { sourceRoot, isProduction }: { sourceRoot: string; isProduction: (file: string) => boolean },
): SharedEntry[] {
  const root = normalizePath(sourceRoot).replace(/\/$/u, '');
  const sources = graph.modules.map((module) => normalizePath(module.source));
  const imports = graph.modules.flatMap((module) => {
    const from = normalizePath(module.source);
    const role = isProduction(from) ? 'production' : 'test';
    return (module.dependencies ?? []).map(({ resolved }): SharedImport => ({
      from,
      to: normalizePath(resolved ?? ''),
      role,
    }));
  });
  const modules = sources.filter((source) => isInsideRoot(source, root) && isProduction(source));
  return sharedUsage({ modules, imports }, { roleOf });
}
