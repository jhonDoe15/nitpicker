import { isPlainObject } from '../../shared/config.mjs';
import { coveredPathChanges } from './covered-paths.mjs';
import { hiddenCodeChanges } from './hidden-code.mjs';
import { checkJsChanges, listedChanges, loosensSetting } from './loosenings.mjs';

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
    ...nestedWithout(settings, 'python', new Set(['exceptions'])),
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

export function describePolicyChanges(baseConfig, headConfig, scope) {
  const settings = changedSettings(baseConfig, headConfig);
  const parts = [
    ...coveredPathChanges(baseConfig, headConfig, scope),
    ...listedChanges(baseConfig, headConfig),
    hiddenCodeChanges(baseConfig, headConfig, scope),
    checkJsChanges(scope.checkJs),
  ];
  return {
    loosened: [
      ...parts.flatMap((part) => part.loosened),
      ...settings.filter((entry) => loosensSetting(entry, scope)).map(({ text }) => text),
    ],
    changed: [
      ...parts.flatMap((part) => part.changed),
      ...settings.filter((entry) => !loosensSetting(entry, scope)).map(({ text }) => text),
    ],
  };
}

export function policyChangeFields(baseConfig, headConfig, scope) {
  const { loosened, changed } = describePolicyChanges(baseConfig, headConfig, scope);
  return { policyChanges: [...loosened, ...changed], policyLoosenings: loosened };
}
