import { DEFAULT_CRAP_SCORE_LIMIT, FILE_LIMIT_DEFAULTS } from '../../shared/policy.mjs';
import { resolveLayout } from '../../languages/typescript/preset/layout.mjs';

const THRESHOLD_DEFAULTS = { crapLimit: DEFAULT_CRAP_SCORE_LIMIT, ...FILE_LIMIT_DEFAULTS };

export const SWITCH_SETTINGS = [/^preset$/u, /^react\.enabled$/u, /^tools\.[^.]+\.precedence$/u];

function addedEntries(baseEntries = [], headEntries = []) {
  const known = new Set(baseEntries.map((entry) => JSON.stringify(entry)));
  return headEntries.filter((entry) => !known.has(JSON.stringify(entry)));
}

function widenedExceptions(baseExceptions = [], headExceptions = []) {
  return headExceptions.flatMap(({ rule, paths, reason }) => {
    const covered = new Set(
      baseExceptions.filter((entry) => entry.rule === rule).flatMap((entry) => entry.paths),
    );
    const added = paths.filter((glob) => !covered.has(glob));
    return added.length === 0
      ? []
      : [`exception added: ${rule} for ${added.join(', ')} (${reason})`];
  });
}

function raisedThresholds(baseThresholds = {}, headThresholds = {}) {
  return Object.entries(headThresholds).flatMap(([key, value]) => {
    const before = baseThresholds[key] ?? THRESHOLD_DEFAULTS[key];
    return value > before
      ? [`threshold ${key} raised from ${String(before)} to ${String(value)}`]
      : [];
  });
}

function removedAnalyzers(baseAnalyzers = [], headAnalyzers = []) {
  const kept = new Set(headAnalyzers.map(({ name }) => name));
  return baseAnalyzers
    .filter(({ name }) => !kept.has(name))
    .map(({ name }) => `analyzer removed: ${name}`);
}

function layoutLoosenings(baseLayout = {}, headLayout = {}) {
  return [
    ...addedEntries(
      resolveLayout(baseLayout).excludedGlobs,
      resolveLayout(headLayout).excludedGlobs,
    ).map((glob) => `layout.excludedGlobs added: ${glob}`),
    ...addedEntries(baseLayout.entryPoints, headLayout.entryPoints).map(
      (glob) => `layout.entryPoints added: ${glob}`,
    ),
  ];
}

export function describeLoosenings(baseConfig, headConfig) {
  return [
    ...addedEntries(baseConfig.exclude, headConfig.exclude).map((glob) => `exclude added: ${glob}`),
    ...addedEntries(baseConfig.disable, headConfig.disable).map(
      (name) => `analyzer disabled: ${name}`,
    ),
    ...widenedExceptions(baseConfig.exceptions, headConfig.exceptions),
    ...widenedExceptions(baseConfig.python?.exceptions, headConfig.python?.exceptions),
    ...raisedThresholds(baseConfig.thresholds, headConfig.thresholds),
    ...removedAnalyzers(baseConfig.analyzers, headConfig.analyzers),
    ...layoutLoosenings(baseConfig.layout, headConfig.layout),
  ];
}
