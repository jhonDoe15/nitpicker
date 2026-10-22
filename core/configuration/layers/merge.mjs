import { isPlainObject } from '../../../shared/config.mjs';

const ROOT_ONLY_KEYS = ['extends', 'projects'];

export function settingsOf(config) {
  return Object.fromEntries(
    Object.entries(config).filter(([key]) => !ROOT_ONLY_KEYS.includes(key)),
  );
}

function mergeValue(shared, own) {
  return isPlainObject(shared) && isPlainObject(own) ? { ...shared, ...own } : own;
}

export function mergeSettings(shared, own) {
  const merged = { ...shared };
  for (const [key, value] of Object.entries(own)) {
    merged[key] = mergeValue(shared[key], value);
  }
  return merged;
}

export function mergeLayers(configs) {
  return configs.reduce((shared, own) => mergeSettings(shared, settingsOf(own)), {});
}
