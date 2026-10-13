import {
  configError,
  isPlainObject,
  validateProjectRelativePath,
} from '../../../shared/config.mjs';
import { FUNCTION_EXCEPTION_RULES } from '../../../shared/policy.mjs';
import { ONE_WAY_RULE_IDS } from './kotlin-rules.mjs';

export const KOTLIN_FORMATTERS = ['ktlint', 'ktfmt', 'none'];
const KOTLIN_KEYS = ['formatter', 'detektConfig'];

const EXCEPTION_RULES = {
  java: FUNCTION_EXCEPTION_RULES,
  kotlin: [...ONE_WAY_RULE_IDS, ...FUNCTION_EXCEPTION_RULES],
};
const EXCEPTION_ADVICE = {
  java: '',
  kotlin: '. Tune any other detekt rule in config/detekt/detekt.yml',
};

function validateGradleExceptions(config) {
  const allowed = EXCEPTION_RULES[config.preset];
  if (allowed === undefined || !Array.isArray(config.exceptions)) {
    return;
  }
  for (const [index, entry] of config.exceptions.entries()) {
    const rule = isPlainObject(entry) ? entry.rule : undefined;
    if (typeof rule === 'string' && rule !== '' && !allowed.includes(rule)) {
      throw configError(
        `"exceptions[${String(index)}].rule" is "${rule}", which is not a rule with exceptions. Rules with exceptions for the ${config.preset} preset: ${allowed.join(', ')}${EXCEPTION_ADVICE[config.preset]}`,
      );
    }
  }
}

export function validateKotlinOptions(config) {
  validateGradleExceptions(config);
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
  const { formatter, detektConfig } = config.kotlin;
  if (formatter !== undefined && !KOTLIN_FORMATTERS.includes(formatter)) {
    throw configError(`"kotlin.formatter" must be one of: ${KOTLIN_FORMATTERS.join(', ')}`);
  }
  if (detektConfig !== undefined) {
    validateProjectRelativePath(detektConfig, 'kotlin.detektConfig');
  }
}
