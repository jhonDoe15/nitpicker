import { DEAD_CODE_RULES, SHARED_EXCEPTION_RULES } from '../policy.mjs';

/** A function name without its parameter list, with `::` written as `.`. */
export function normalizeFunctionName(name) {
  const bare = name.replace(/\(.*$/s, '').trim().replaceAll('::', '.');
  return bare === '' ? name : bare;
}

/** The sentence that names the config entry which accepts a finding of `rule` in `path`. */
export function exceptionRoute({ rule, path, name }) {
  const entry = {
    rule,
    paths: [path],
    ...(name === undefined ? {} : { function: normalizeFunctionName(name) }),
    reason: '...',
  };
  return `If this is intended, add ${JSON.stringify(entry)} to "exceptions" in nitpicker.config.json.`;
}

/** The rule an `exceptions` entry names: `<tool>/<rule>`, as a finding prints it, names `<rule>` too. */
export function canonicalRule(rule) {
  const bare = rule.slice(rule.indexOf('/') + 1);
  return [...SHARED_EXCEPTION_RULES, ...DEAD_CODE_RULES].includes(bare) ? bare : rule;
}
