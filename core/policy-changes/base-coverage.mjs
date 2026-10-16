import {
  builtInExcludedGlobs,
  sourceRoots,
  testRoots,
} from '../../languages/typescript/preset/layout.mjs';
import { THRESHOLD_DEFAULTS } from './loosenings.mjs';

const DEFAULT_ROOTS = { sourceRoots, testRoots };
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

function commonExceptions(base, head = []) {
  return base
    .map((entry) => ({
      ...entry,
      paths: entry.paths.filter((glob) =>
        head.some(({ rule, paths }) => rule === entry.rule && paths.includes(glob)),
      ),
    }))
    .filter(({ paths }) => paths.length > 0);
}

function stricterThresholds(base = {}, head = {}) {
  return Object.fromEntries(
    union(Object.keys(base), Object.keys(head)).map((key) => [
      key,
      Math.min(base[key] ?? THRESHOLD_DEFAULTS[key], head[key] ?? THRESHOLD_DEFAULTS[key]),
    ]),
  );
}

function stricterLists(baseConfig, headConfig) {
  const covering = {};
  if (baseConfig.exclude !== undefined) {
    covering.exclude = common(baseConfig.exclude, headConfig.exclude ?? []);
  }
  if (baseConfig.disable !== undefined) {
    covering.disable = common(baseConfig.disable, headConfig.disable ?? []);
  }
  if (baseConfig.exceptions !== undefined) {
    covering.exceptions = commonExceptions(baseConfig.exceptions, headConfig.exceptions);
  }
  if (baseConfig.thresholds !== undefined || headConfig.thresholds !== undefined) {
    covering.thresholds = stricterThresholds(baseConfig.thresholds, headConfig.thresholds);
  }
  if (baseConfig.python?.exceptions !== undefined) {
    covering.python = {
      ...baseConfig.python,
      exceptions: commonExceptions(baseConfig.python.exceptions, headConfig.python?.exceptions),
    };
  }
  return covering;
}

export function baseConfigCoveringHead(baseConfig, headConfig) {
  const layout = coveringLayout(baseConfig.layout ?? {}, headConfig.layout ?? {});
  const covering = { ...baseConfig, ...stricterLists(baseConfig, headConfig) };
  if (Object.keys(layout).length > 0) {
    covering.layout = layout;
  }
  return covering;
}
