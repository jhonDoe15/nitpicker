import { PRESET_TOOLS, toolsOf } from './rule-tools.mjs';
import { exceptionEntryText, exceptionSentence } from '../messages/exception-sentence.mjs';

/** A function name without its parameter list, with `::` written as `.`. */
export function normalizeFunctionName(name) {
  let quoted = false;
  let end = name.length;
  for (const [index, character] of [...name].entries()) {
    if (character === '`') {
      quoted = !quoted;
    } else if (character === '(' && !quoted) {
      end = index;
      break;
    }
  }
  const bare = name.slice(0, end).trim().replaceAll('::', '.');
  return bare === '' ? name : bare;
}

/** The sentence that names the config entry which accepts a finding of `rule` in `path`; none for a finding without a path. */
export function exceptionRoute({ rule, path, function: functionName, name, key }) {
  if (typeof path !== 'string') {
    return undefined;
  }
  return exceptionSentence(
    exceptionEntryText({
      rule,
      path,
      name,
      ...(functionName === undefined ? {} : { function: normalizeFunctionName(functionName) }),
    }),
    key,
  );
}

function splitPrinted(rule) {
  const separator = rule.indexOf('/');
  const rest = separator === -1 ? undefined : rule.slice(separator + 1);
  return rest !== undefined && toolsOf(rest) !== undefined
    ? { tool: rule.slice(0, separator), rest }
    : undefined;
}

/** The rule an `exceptions` entry names: `<tool>/<rule>`, as a finding prints it, names `<rule>` too. */
export function canonicalRule(rule) {
  const printed = splitPrinted(rule);
  return printed !== undefined && toolsOf(printed.rest).includes(printed.tool)
    ? printed.rest
    : rule;
}

/** Whether `rule` is one nitpicker adds, bare or as printed. */
export function isAddedRule(rule) {
  return toolsOf(canonicalRule(rule)) !== undefined;
}

/** The error for a `<tool>/<rule>` whose tool does not print that rule in `preset`, or undefined. */
export function toolPrefixError(rule, preset) {
  const printed = splitPrinted(rule);
  if (printed === undefined) {
    return undefined;
  }
  const valid = toolsOf(printed.rest).filter((tool) =>
    (PRESET_TOOLS[preset] ?? Object.values(PRESET_TOOLS).flat()).includes(tool),
  );
  return valid.includes(printed.tool)
    ? undefined
    : `unknown tool prefix "${printed.tool}" for ${printed.rest}: use the rule bare or as ${valid.map((tool) => `${tool}/${printed.rest}`).join(' or ')}`;
}
