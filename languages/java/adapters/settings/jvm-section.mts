import { GRADLE_PRESETS } from '../gradle-presets.mts';
import { configError as untypedConfigError } from '../../../../shared/config.mjs';
import { suggestionOrAllowed as untypedSuggestionOrAllowed } from '../../../../shared/messages/closest-match.mjs';
import { isPlainObject, textOf, type Fields } from '../../../../shared/values/readers.mts';

const configError: (message: string, anchor?: string) => Error = untypedConfigError;
const suggestionOrAllowed: (input: string, candidates: readonly string[]) => string =
  untypedSuggestionOrAllowed;

export function validateJvmSection(
  config: Fields,
  key: string,
  allowedKeys: readonly string[],
): Fields | undefined {
  const section = config[key];
  if (section === undefined) {
    return undefined;
  }
  if (!GRADLE_PRESETS.includes(textOf(config['preset']))) {
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
