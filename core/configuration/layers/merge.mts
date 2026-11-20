import { SCHEMA_KEY } from '../../../shared/config.mjs';
import type { ConfigSettings } from '../../../shared/values/config-types.mts';
import { fieldsOf, isPlainObject } from '../../../shared/values/readers.mts';

const ROOT_ONLY_KEYS = [SCHEMA_KEY, 'extends', 'projects'];

export function settingsOf(config: unknown): ConfigSettings {
  return Object.fromEntries(
    Object.entries(fieldsOf(config)).filter(([key]) => !ROOT_ONLY_KEYS.includes(key)),
  );
}

function mergeValue(shared: unknown, own: unknown): unknown {
  return isPlainObject(shared) && isPlainObject(own) ? { ...shared, ...own } : own;
}

export function mergeSettings(shared: ConfigSettings, own: ConfigSettings): ConfigSettings {
  const merged: Record<string, unknown> = { ...shared };
  for (const [key, value] of Object.entries(own)) {
    merged[key] = mergeValue(shared[key], value);
  }
  return merged;
}

export function mergeLayers(configs: readonly unknown[]): ConfigSettings {
  return configs.reduce<ConfigSettings>(
    (shared, own) => mergeSettings(shared, settingsOf(own)),
    {},
  );
}
