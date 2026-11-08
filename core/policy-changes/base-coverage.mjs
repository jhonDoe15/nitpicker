import {
  builtInExcludedGlobs,
  defaultResolvedLayout,
  sourceRoots,
  testRoots,
} from '../../languages/typescript/preset/layout.mjs';
import { THRESHOLD_DEFAULTS } from './loosenings.mjs';
import { canonicalRule } from '../../shared/exceptions/rule-names.mjs';
import { sameJson } from '../../shared/config.mjs';

const UNSET_ROOTS = { sourceRoots, testRoots: defaultResolvedLayout.executedTestRoots };
const DEFAULT_LAYOUT = {
  sourceRoots,
  testRoots,
  excludedGlobs: builtInExcludedGlobs,
  entryPoints: [],
};

function union(base, head) {
  return [...new Set([...base, ...head])];
}

function common(base, head) {
  return base.filter((entry) => head.includes(entry));
}

function coveringLayout(baseLayout, headLayout) {
  const roots = Object.fromEntries(
    Object.entries(UNSET_ROOTS).map(([key, unset]) => [
      key,
      union(baseLayout[key] ?? unset, headLayout[key] ?? unset),
    ]),
  );
  const excludedGlobs = common(
    baseLayout.excludedGlobs ?? builtInExcludedGlobs,
    headLayout.excludedGlobs ?? builtInExcludedGlobs,
  );
  const entryPoints = common(baseLayout.entryPoints ?? [], headLayout.entryPoints ?? []);
  return Object.fromEntries(
    Object.entries({ ...roots, excludedGlobs, entryPoints }).filter(
      ([key, value]) =>
        baseLayout[key] !== undefined ||
        (headLayout[key] !== undefined && !sameJson(value, DEFAULT_LAYOUT[key])),
    ),
  );
}

function sameScope(left, right) {
  return (
    canonicalRule(left.rule) === canonicalRule(right.rule) &&
    left.function === right.function &&
    left.name === right.name
  );
}

function commonExceptions(base, head = []) {
  return base
    .map((entry) => ({
      ...entry,
      paths: entry.paths.filter((glob) =>
        head.some((other) => sameScope(entry, other) && other.paths.includes(glob)),
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
  if (baseConfig.python?.entryPoints !== undefined) {
    covering.python = {
      ...(covering.python ?? baseConfig.python),
      entryPoints: common(baseConfig.python.entryPoints, headConfig.python?.entryPoints ?? []),
    };
  }
  return covering;
}

const HEAD_ANALYSIS_KEYS = ['duplicates', 'history'];

function withHeadAnalysisSettings(baseConfig, headConfig) {
  return {
    ...Object.fromEntries(
      Object.entries(baseConfig).filter(
        ([key]) => !HEAD_ANALYSIS_KEYS.includes(key) || headConfig[key] !== undefined,
      ),
    ),
    ...Object.fromEntries(
      HEAD_ANALYSIS_KEYS.filter((key) => headConfig[key] !== undefined).map((key) => [
        key,
        headConfig[key],
      ]),
    ),
  };
}

export function baseConfigCoveringHead(baseConfig, headConfig) {
  const layout = coveringLayout(baseConfig.layout ?? {}, headConfig.layout ?? {});
  const covering = { ...baseConfig, ...stricterLists(baseConfig, headConfig) };
  if (Object.keys(layout).length > 0) {
    covering.layout = layout;
  }
  return withHeadAnalysisSettings(covering, headConfig);
}
