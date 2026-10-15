import { isPlainObject } from '../../shared/config.mjs';
import { DEFAULT_CRAP_SCORE_LIMIT, FILE_LIMIT_DEFAULTS } from '../../shared/policy.mjs';

const THRESHOLD_DEFAULTS = { crapLimit: DEFAULT_CRAP_SCORE_LIMIT, ...FILE_LIMIT_DEFAULTS };
const LISTED_KEYS = new Set(['exclude', 'disable', 'exceptions', 'thresholds', 'analyzers']);

function addedEntries(baseEntries = [], headEntries = []) {
  const known = new Set(baseEntries.map((entry) => JSON.stringify(entry)));
  return headEntries.filter((entry) => !known.has(JSON.stringify(entry)));
}

function describeException({ rule, paths, reason }) {
  return `exception added: ${rule} for ${paths.join(', ')} (${reason})`;
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

function withoutKeys(object, keys) {
  return Object.fromEntries(Object.entries(object).filter(([key]) => !keys.has(key)));
}

function leaves(value, prefix) {
  return isPlainObject(value)
    ? Object.entries(value).flatMap(([key, child]) => leaves(child, `${prefix}.${key}`))
    : [[prefix, value]];
}

function settingLeaves(config) {
  const settings = withoutKeys(config, LISTED_KEYS);
  const python = isPlainObject(settings.python)
    ? { python: withoutKeys(settings.python, new Set(['exceptions'])) }
    : {};
  return new Map(
    Object.entries({ ...settings, ...python }).flatMap(([key, value]) => leaves(value, key)),
  );
}

function show(value) {
  return value === undefined ? 'not set' : JSON.stringify(value);
}

function changedSettings(baseConfig, headConfig) {
  const before = settingLeaves(baseConfig);
  const after = settingLeaves(headConfig);
  return [...new Set([...before.keys(), ...after.keys()])].flatMap((setting) =>
    JSON.stringify(before.get(setting)) === JSON.stringify(after.get(setting))
      ? []
      : [`${setting}: ${show(before.get(setting))} -> ${show(after.get(setting))}`],
  );
}

export function describePolicyChanges(baseConfig, headConfig) {
  return [
    ...addedEntries(baseConfig.exclude, headConfig.exclude).map((glob) => `exclude added: ${glob}`),
    ...addedEntries(baseConfig.disable, headConfig.disable).map(
      (name) => `analyzer disabled: ${name}`,
    ),
    ...addedEntries(baseConfig.exceptions, headConfig.exceptions).map(describeException),
    ...addedEntries(baseConfig.python?.exceptions, headConfig.python?.exceptions).map(
      describeException,
    ),
    ...raisedThresholds(baseConfig.thresholds, headConfig.thresholds),
    ...removedAnalyzers(baseConfig.analyzers, headConfig.analyzers),
    ...changedSettings(baseConfig, headConfig),
  ];
}
