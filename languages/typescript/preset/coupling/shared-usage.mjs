import {
  featureRoles,
  sharedUsedByOneFeature as sharedUsage,
} from '../../../../shared/rules/features/shared-usage.mjs';
import { featureLayout } from '../architecture/strict-layout.mjs';
import { normalizePath } from '../dependency-graph/cruise.mjs';

const roleOf = featureRoles(featureLayout);

export function sharedUsedByOneFeature(graph, { sourceRoot, isProduction }) {
  const root = normalizePath(sourceRoot).replace(/\/$/u, '');
  const sources = graph.modules.map((module) => normalizePath(module.source));
  const imports = graph.modules.flatMap((module) => {
    const from = normalizePath(module.source);
    const role = isProduction(from) ? 'production' : 'test';
    return (module.dependencies ?? []).map(({ resolved }) => ({
      from,
      to: normalizePath(resolved ?? ''),
      role,
    }));
  });
  const modules = sources.filter((source) => source.startsWith(`${root}/`) && isProduction(source));
  return sharedUsage({ modules, imports }, { roleOf });
}
