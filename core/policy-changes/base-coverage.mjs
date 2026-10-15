import { builtInExcludedGlobs } from '../../languages/typescript/preset/layout.mjs';

const DEFAULT_ROOTS = { sourceRoots: ['src'], testRoots: ['test', 'tests'] };
const DEFAULT_LAYOUT = { ...DEFAULT_ROOTS, excludedGlobs: builtInExcludedGlobs, entryPoints: [] };

function union(base, head) {
  return [...new Set([...base, ...head])];
}

function common(base, head) {
  return base.filter((entry) => head.includes(entry));
}

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function coveringLayout(baseLayout, headLayout) {
  const roots = Object.fromEntries(
    Object.entries(DEFAULT_ROOTS).map(([key, defaults]) => {
      const base = baseLayout[key] ?? defaults;
      return [key, union(base, headLayout[key] ?? defaults)];
    }),
  );
  const excludedGlobs = common(
    baseLayout.excludedGlobs ?? builtInExcludedGlobs,
    headLayout.excludedGlobs ?? builtInExcludedGlobs,
  );
  const entryPoints = common(baseLayout.entryPoints ?? [], headLayout.entryPoints ?? []);
  return Object.fromEntries(
    Object.entries({ ...roots, excludedGlobs, entryPoints }).filter(
      ([key, value]) => baseLayout[key] !== undefined || !same(value, DEFAULT_LAYOUT[key]),
    ),
  );
}

export function baseConfigCoveringHead(baseConfig, headConfig) {
  const layout = coveringLayout(baseConfig.layout ?? {}, headConfig.layout ?? {});
  const exclude = common(baseConfig.exclude ?? [], headConfig.exclude ?? []);
  const covering = { ...baseConfig };
  if (Object.keys(layout).length > 0) {
    covering.layout = layout;
  }
  if (baseConfig.exclude !== undefined) {
    covering.exclude = exclude;
  }
  return covering;
}
