import {
  builtInExcludedGlobs,
  canonicalRule,
  defaultResolvedLayout,
  sourceRoots,
  testRoots,
} from './types/typed-views.mts';
import { sameJson, THRESHOLD_DEFAULTS } from './types/config-views.mts';
import { exceptionEntries, thresholdsOf } from './types/config-readers.mts';
import { textsOf } from '../../shared/values/readers.mts';
import type { ExceptionEntry, LayoutConfig, PolicyConfig } from './types/policy-types.mts';

type MutableConfig = { -readonly [K in keyof PolicyConfig]: PolicyConfig[K] };

const UNSET_ROOTS = { sourceRoots, testRoots: defaultResolvedLayout.executedTestRoots };
const DEFAULT_LAYOUT: Readonly<Record<string, readonly string[]>> = {
  sourceRoots,
  testRoots,
  excludedGlobs: builtInExcludedGlobs,
  entryPoints: [],
};

function union(base: readonly string[], head: readonly string[]): string[] {
  return [...new Set([...base, ...head])];
}

function common(base: readonly string[], head: readonly string[]): string[] {
  return base.filter((entry) => head.includes(entry));
}

function layoutList(layout: LayoutConfig, key: string): readonly string[] | undefined {
  const value = layout[key];
  return Array.isArray(value) ? textsOf(value) : undefined;
}

function coveringLayout(baseLayout: LayoutConfig, headLayout: LayoutConfig): LayoutConfig {
  const roots = Object.fromEntries(
    Object.entries(UNSET_ROOTS).map(([key, unset]) => [
      key,
      union(layoutList(baseLayout, key) ?? unset, layoutList(headLayout, key) ?? unset),
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

function sameScope(left: ExceptionEntry, right: ExceptionEntry): boolean {
  return (
    canonicalRule(left.rule) === canonicalRule(right.rule) &&
    left.function === right.function &&
    left.name === right.name
  );
}

function commonExceptions(
  base: readonly ExceptionEntry[],
  head: readonly ExceptionEntry[] = [],
): ExceptionEntry[] {
  return base
    .map((entry) => ({
      ...entry,
      paths: entry.paths.filter((glob) =>
        head.some((other) => sameScope(entry, other) && other.paths.includes(glob)),
      ),
    }))
    .filter(({ paths }) => paths.length > 0);
}

function stricterThresholds(
  base: Readonly<Record<string, number>> = {},
  head: Readonly<Record<string, number>> = {},
): Record<string, number> {
  return Object.fromEntries(
    union(Object.keys(base), Object.keys(head)).map((key) => [
      key,
      Math.min(
        base[key] ?? THRESHOLD_DEFAULTS[key] ?? Number.NaN,
        head[key] ?? THRESHOLD_DEFAULTS[key] ?? Number.NaN,
      ),
    ]),
  );
}

function stricterLists(baseConfig: PolicyConfig, headConfig: PolicyConfig): MutableConfig {
  const covering: MutableConfig = {};
  if (baseConfig.exclude !== undefined) {
    covering.exclude = common(baseConfig.exclude, headConfig.exclude ?? []);
  }
  if (baseConfig.disable !== undefined) {
    covering.disable = common(baseConfig.disable, headConfig.disable ?? []);
  }
  if (baseConfig.exceptions !== undefined) {
    covering.exceptions = commonExceptions(
      exceptionEntries(baseConfig.exceptions) ?? [],
      exceptionEntries(headConfig.exceptions),
    );
  }
  if (baseConfig.thresholds !== undefined || headConfig.thresholds !== undefined) {
    covering.thresholds = stricterThresholds(
      thresholdsOf(baseConfig.thresholds),
      thresholdsOf(headConfig.thresholds),
    );
  }
  if (baseConfig.python?.exceptions !== undefined) {
    covering.python = {
      ...baseConfig.python,
      exceptions: commonExceptions(
        exceptionEntries(baseConfig.python.exceptions) ?? [],
        exceptionEntries(headConfig.python?.exceptions),
      ),
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

function withHeadAnalysisSettings(
  baseConfig: PolicyConfig,
  headConfig: PolicyConfig,
): PolicyConfig {
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

export function baseConfigCoveringHead(
  baseConfig: PolicyConfig,
  headConfig: PolicyConfig,
): PolicyConfig {
  const layout = coveringLayout(baseConfig.layout ?? {}, headConfig.layout ?? {});
  const covering = { ...baseConfig, ...stricterLists(baseConfig, headConfig) };
  if (Object.keys(layout).length > 0) {
    covering.layout = layout;
  }
  return withHeadAnalysisSettings(covering, headConfig);
}
