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
import { suggestionOrAllowed } from '../../../../shared/messages/closest-match.mjs';

export const GO_LINT_TOOLS = ['vet'];
export const GO_EXCEPTION_RULES = [...COMMON_EXCEPTION_RULES, ...GO_SIZE_RULES];
export const GO_SETTING_KEYS = ['formatters', 'buildTags'];
export const BUILD_TAG = /^!?[\w.]+$/u;
const TYPESCRIPT_REASON =
  'it describes the TypeScript source layout and React rules, which the Go preset does not have';
const UNSUPPORTED_KEYS = new Map([
  ...TYPESCRIPT_ONLY_KEYS.filter((key) => !['exceptions', 'tools'].includes(key)).map((key) => [
    key,
    TYPESCRIPT_REASON,
  ]),
  ['layout', 'Go packages follow the module, so there are no source roots to set'],
  ['duplicates', 'the Go preset runs no duplicate-code scan'],
]);

function validateUnsupported(config) {
  const unsupported = [...UNSUPPORTED_KEYS.keys()].find((key) => config[key] !== undefined);
  if (unsupported !== undefined) {
    throw configError(
      `"${unsupported}" is not supported with "preset": "go": ${UNSUPPORTED_KEYS.get(unsupported)}. Not supported with go: ${[...UNSUPPORTED_KEYS.keys()].join(', ')}. Shared by all presets: thresholds, exclude, exceptions, legacyInventory`,
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
  const unknown = Object.keys(settings).find((key) => !GO_SETTING_KEYS.includes(key));
  if (unknown !== undefined) {
    throw configError(
      `unknown key "${unknown}" in "go"${suggestionOrAllowed(unknown, GO_SETTING_KEYS)}`,
    );
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
