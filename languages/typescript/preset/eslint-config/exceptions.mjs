import { SHARED_EXCEPTION_RULES } from '../../../../shared/policy.mjs';
import { PACKAGE_EXCEPTION_RULES } from '../../../../shared/hygiene/rules.mjs';

const NON_ESLINT_RULES = [...SHARED_EXCEPTION_RULES, ...PACKAGE_EXCEPTION_RULES];

export function applyRuleExceptions(configEntries, allExceptions = []) {
  const exceptions = allExceptions.filter(({ rule }) => !NON_ESLINT_RULES.includes(rule));
  const unknown = exceptions.filter(({ rule }) => !isKnownRule(configEntries, rule));
  if (unknown.length > 0) {
    throw new Error(
      `nitpicker.config.json "exceptions" name unknown rules: ${unknown.map(({ rule }) => rule).join(', ')}`,
    );
  }
  return [
    ...configEntries,
    ...exceptions.map(({ rule, paths }) => ({ files: paths, rules: { [rule]: 'off' } })),
  ];
}

export function applyMatchingRuleExceptions(configEntries, exceptions = []) {
  return applyRuleExceptions(
    configEntries,
    exceptions.filter(({ rule }) => isKnownRule(configEntries, rule)),
  );
}

function isKnownRule(configEntries, rule) {
  const separator = rule.lastIndexOf('/');
  const pluginName = separator === -1 ? undefined : rule.slice(0, separator);
  const localName = separator === -1 ? rule : rule.slice(separator + 1);
  return configEntries.some(
    (entry) =>
      Object.hasOwn(entry.rules ?? {}, rule) ||
      (pluginName !== undefined && entry.plugins?.[pluginName]?.rules?.[localName] !== undefined),
  );
}
