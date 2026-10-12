import { configError, isPlainObject } from '../../../shared/config.mjs';
import { ONE_WAY_RULE_IDS } from './kotlin-rules.mjs';

export const KOTLIN_FORMATTERS = ['ktlint', 'ktfmt'];
const KOTLIN_KEYS = ['formatter'];

function validateKotlinExceptions(config) {
  if (config.preset !== 'kotlin' || !Array.isArray(config.exceptions)) {
    return;
  }
  for (const [index, entry] of config.exceptions.entries()) {
    const rule = isPlainObject(entry) ? entry.rule : undefined;
    if (typeof rule === 'string' && rule !== '' && !ONE_WAY_RULE_IDS.includes(rule)) {
      throw configError(
        `"exceptions[${String(index)}].rule" is "${rule}", which is not a rule with exceptions. Rules with exceptions for the kotlin preset: ${ONE_WAY_RULE_IDS.join(', ')}. Tune any other detekt rule in config/detekt/detekt.yml`,
      );
    }
  }
}

export function validateKotlinOptions(config) {
  validateKotlinExceptions(config);
  if (config.kotlin === undefined) {
    return;
  }
  if (config.preset !== 'kotlin') {
    throw configError('"kotlin" is only supported with "preset": "kotlin"');
  }
  if (!isPlainObject(config.kotlin)) {
    throw configError('"kotlin" must be an object');
  }
  for (const key of Object.keys(config.kotlin)) {
    if (!KOTLIN_KEYS.includes(key)) {
      throw configError(`unknown key "kotlin.${key}". Allowed keys: ${KOTLIN_KEYS.join(', ')}`);
    }
  }
  const { formatter } = config.kotlin;
  if (formatter !== undefined && !KOTLIN_FORMATTERS.includes(formatter)) {
    throw configError(`"kotlin.formatter" must be one of: ${KOTLIN_FORMATTERS.join(', ')}`);
  }
}
