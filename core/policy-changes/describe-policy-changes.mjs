import { CONFIG_FILE_NAME, isPlainObject } from '../../shared/config.mjs';
import { policyDigest } from '../diff/reporting/review/policy-findings.mjs';
import { buildNarrowingChanges } from './build-files/build-narrowing.mjs';
import { toolConfigChanges } from './build-files/tool-config-changes.mjs';
import { coveredPathChanges } from './paths/covered-paths.mjs';
import { hiddenCodeChanges } from './paths/hidden-code.mjs';
import { tsconfigChanges } from './paths/tsconfig-changes.mjs';
import { listedChanges, loosensSetting } from './loosenings.mjs';

const LISTED_KEYS = new Set(['exclude', 'disable', 'exceptions', 'thresholds', 'analyzers']);
const LISTED_LAYOUT_KEYS = new Set(['excludedGlobs', 'entryPoints']);

function withoutKeys(object, keys) {
  return Object.fromEntries(Object.entries(object).filter(([key]) => !keys.has(key)));
}

function leaves(value, prefix) {
  const pending = [[prefix, value]];
  const found = [];
  for (const [path, node] of pending) {
    if (isPlainObject(node)) {
      pending.push(...Object.entries(node).map(([key, child]) => [`${path}.${key}`, child]));
    } else {
      found.push([path, node]);
    }
  }
  return found;
}

function nestedWithout(settings, key, keys) {
  return isPlainObject(settings[key]) ? { [key]: withoutKeys(settings[key], keys) } : {};
}

function settingLeaves(config) {
  const settings = withoutKeys(config, LISTED_KEYS);
  const nested = {
    ...nestedWithout(settings, 'python', new Set(['exceptions', 'entryPoints'])),
    ...nestedWithout(settings, 'layout', LISTED_LAYOUT_KEYS),
  };
  return new Map(
    Object.entries({ ...settings, ...nested }).flatMap(([key, value]) => leaves(value, key)),
  );
}

function show(value) {
  return value === undefined ? 'not set' : JSON.stringify(value);
}

function changedSettings(baseConfig, headConfig) {
  const before = settingLeaves(baseConfig);
  const after = settingLeaves(headConfig);
  return [...new Set([...before.keys(), ...after.keys()])].flatMap((setting) => {
    const change = { setting, before: before.get(setting), after: after.get(setting) };
    return JSON.stringify(change.before) === JSON.stringify(change.after)
      ? []
      : [{ ...change, text: `${setting}: ${show(change.before)} -> ${show(change.after)}` }];
  });
}

function loosening(entry) {
  return typeof entry === 'string'
    ? { text: entry, key: entry, files: [CONFIG_FILE_NAME] }
    : { key: entry.text, ...entry };
}

function describedEntries(baseConfig, headConfig, scope) {
  const settings = changedSettings(baseConfig, headConfig);
  const parts = [
    ...coveredPathChanges(baseConfig, headConfig, scope),
    ...listedChanges(baseConfig, headConfig),
    hiddenCodeChanges(baseConfig, headConfig, scope),
    tsconfigChanges(scope),
    ...buildNarrowingChanges(scope),
    toolConfigChanges(scope),
  ];
  return {
    loosened: [
      ...parts.flatMap((part) => part.loosened),
      ...settings.filter((entry) => loosensSetting(entry, scope)).map(({ text }) => text),
    ].map(loosening),
    changed: [
      ...parts.flatMap((part) => part.changed),
      ...settings.filter((entry) => !loosensSetting(entry, scope)).map(({ text }) => text),
    ],
  };
}

export function describePolicyChanges(baseConfig, headConfig, scope) {
  const { loosened, changed } = describedEntries(baseConfig, headConfig, scope);
  return { loosened: loosened.map(({ text }) => text), changed };
}

function evidenceDigest(loosened, scope) {
  const files = [...new Set(loosened.flatMap((entry) => entry.files))].toSorted();
  return policyDigest({
    loosenings: loosened.map(({ key }) => key),
    files: files.map((file) => [file, scope.blobOf(file)]),
  });
}

export function policyChangeFields(baseConfig, headConfig, scope) {
  const { loosened, changed } = describedEntries(baseConfig, headConfig, scope);
  const texts = loosened.map(({ text }) => text);
  return {
    policyChanges: [...texts, ...changed],
    policyLoosenings: texts,
    ...(loosened.length === 0 ? {} : { policyDigest: evidenceDigest(loosened, scope) }),
  };
}
