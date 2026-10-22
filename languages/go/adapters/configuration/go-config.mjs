import {
  configError,
  isPlainObject,
  TYPESCRIPT_ONLY_KEYS,
  validateStringArray,
} from '../../../../shared/config.mjs';
import { canonicalRule } from '../../../../shared/exceptions/rule-names.mjs';
import { COMMON_EXCEPTION_RULES } from '../../../../shared/policy.mjs';
import { GO_SIZE_RULES } from '../../../../shared/project-rules/size-rules.mjs';
import { FORMATTERS } from '../formatting/go-formatters.mjs';

export const GO_LINT_TOOLS = ['vet'];
const GO_EXCEPTION_RULES = [...COMMON_EXCEPTION_RULES, ...GO_SIZE_RULES];
const SETTING_KEYS = ['formatters', 'buildTags'];
const BUILD_TAG = /^!?[\w.]+$/u;
const UNSUPPORTED_KEYS = TYPESCRIPT_ONLY_KEYS.filter(
  (key) => !['exceptions', 'tools'].includes(key),
);

function validateUnsupported(config) {
  const unsupported = UNSUPPORTED_KEYS.filter((key) => config[key] !== undefined);
  if (unsupported.length > 0) {
    throw configError(
      `"${unsupported[0]}" is not supported with "preset": "go": it describes the TypeScript source layout and React rules, which the Go preset does not have. Not supported with go: ${UNSUPPORTED_KEYS.join(', ')}. Shared by all presets: thresholds, exclude, exceptions, legacyInventory`,
    );
  }
  if (config.thresholds?.inheritanceDepth !== undefined) {
    throw configError(
      '"thresholds.inheritanceDepth" is not supported with "preset": "go": Go has no inheritance (embedding is composition)',
    );
  }
}

function validateFormatters(formatters) {
  validateStringArray(formatters, 'go.formatters');
  const unknown = formatters.find((name) => !FORMATTERS.includes(name));
  if (formatters.length === 0 || unknown !== undefined) {
    throw configError(`"go.formatters" must list one or more of: ${FORMATTERS.join(', ')}`);
  }
  if (new Set(formatters).size !== formatters.length) {
    throw configError('"go.formatters" must not contain duplicates');
  }
}

function validateBuildTags(tags) {
  validateStringArray(tags, 'go.buildTags');
  const invalid = tags.find((tag) => !BUILD_TAG.test(tag));
  if (invalid !== undefined) {
    throw configError(
      `"go.buildTags" entries must be build tag names, such as "integration": ${invalid}`,
    );
  }
}

function validateSettings(settings) {
  if (!isPlainObject(settings)) {
    throw configError('"go" must be an object');
  }
  const unknown = Object.keys(settings).find((key) => !SETTING_KEYS.includes(key));
  if (unknown !== undefined) {
    throw configError(`unknown key "${unknown}" in "go". Allowed keys: ${SETTING_KEYS.join(', ')}`);
  }
  if (settings.formatters !== undefined) {
    validateFormatters(settings.formatters);
  }
  if (settings.buildTags !== undefined) {
    validateBuildTags(settings.buildTags);
  }
}

function isGoFindingRule(rule) {
  const [tool] = rule.split('/');
  return GO_LINT_TOOLS.includes(tool) && rule.length > tool.length + 1;
}

function validateExceptionRules(exceptions) {
  for (const [index, entry] of exceptions.entries()) {
    const rule = entry?.rule;
    if (
      typeof rule !== 'string' ||
      rule === '' ||
      GO_EXCEPTION_RULES.includes(canonicalRule(rule))
    ) {
      continue;
    }
    if (!isGoFindingRule(rule)) {
      throw configError(
        `"exceptions[${String(index)}].rule" must name a finding as it is printed, "<tool>/<rule>" (for example "vet/printf"), or one of ${GO_EXCEPTION_RULES.join(', ')}. Tools: ${GO_LINT_TOOLS.join(', ')}`,
      );
    }
  }
}

export function validateGoConfig(config) {
  if (config.preset !== 'go') {
    if (config.go !== undefined) {
      throw configError('"go" is only supported with "preset": "go"');
    }
    return;
  }
  validateUnsupported(config);
  if (config.go !== undefined) {
    validateSettings(config.go);
  }
  if (Array.isArray(config.exceptions)) {
    validateExceptionRules(config.exceptions);
  }
}
