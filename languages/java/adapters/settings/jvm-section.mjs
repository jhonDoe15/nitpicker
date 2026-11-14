import { GRADLE_PRESETS } from '../gradle-presets.mjs';
import { configError, isPlainObject } from '../../../../shared/config.mjs';
import { suggestionOrAllowed } from '../../../../shared/messages/closest-match.mjs';

export function validateJvmSection(config, key, allowedKeys) {
  const section = config[key];
  if (section === undefined) {
    return undefined;
  }
  if (!GRADLE_PRESETS.includes(config.preset)) {
    throw configError(
      `"${key}" is only supported with ${GRADLE_PRESETS.map((preset) => `"preset": "${preset}"`).join(' or ')}`,
    );
  }
  if (!isPlainObject(section)) {
    throw configError(`"${key}" must be an object`);
  }
  for (const name of Object.keys(section)) {
    if (!allowedKeys.includes(name)) {
      throw configError(`unknown key "${key}.${name}"${suggestionOrAllowed(name, allowedKeys)}`);
    }
  }
  return section;
}
