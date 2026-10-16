import { isAddedRule } from '../../../../shared/exceptions/rule-names.mjs';
import { strictBoundaryRules } from '../architecture/strict-boundary-rules.mjs';

const boundaryRuleNames = strictBoundaryRules.map(({ name }) => name);

export function applyRuleExceptions(configEntries, allExceptions = []) {
  const exceptions = allExceptions.filter(
    ({ rule }) => !isAddedRule(rule) && !boundaryRuleNames.includes(rule),
  );
  const unknown = exceptions.filter(({ rule }) => !isKnownRule(configEntries, rule));
  if (unknown.length > 0) {
    throw new Error(
      `nitpicker.config.json "exceptions" name unknown rules: ${unknown.map(({ rule }) => rule).join(', ')}. Only rules nitpicker runs can be lifted: check the spelling.`,
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
