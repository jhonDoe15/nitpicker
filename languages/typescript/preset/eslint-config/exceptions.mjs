/**
 * Lifts configured rules for configured paths. Exceptions come only from nitpicker.config.json
 * through the head policy; the strict preset bans inline disables, so this is the one way out.
 */
export function applyRuleExceptions(configEntries, exceptions = []) {
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
