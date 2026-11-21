import { PRESET_TOOLS, toolsOf } from './rule-tools.mts';
import { exceptionEntryText, exceptionSentence } from '../messages/exception-sentence.mts';

export function normalizeFunctionName(name: string): string {
  let quoted = false;
  let end = name.length;
  for (const [index, character] of Array.from(name).entries()) {
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

export function exceptionRoute({
  rule,
  path,
  function: functionName,
  name,
  key,
}: {
  readonly rule: string;
  readonly path?: unknown;
  readonly function?: string | undefined;
  readonly name?: string | undefined;
  readonly key?: string | undefined;
}): string | undefined {
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

function splitPrinted(rule: string): { tool: string; rest: string } | undefined {
  const separator = rule.indexOf('/');
  const rest = separator === -1 ? undefined : rule.slice(separator + 1);
  return rest !== undefined && toolsOf(rest) !== undefined
    ? { tool: rule.slice(0, separator), rest }
    : undefined;
}

export function canonicalRule(rule: string): string {
  const printed = splitPrinted(rule);
  return printed !== undefined && toolsOf(printed.rest)?.includes(printed.tool) === true
    ? printed.rest
    : rule;
}

export function isAddedRule(rule: string): boolean {
  return toolsOf(canonicalRule(rule)) !== undefined;
}

export function toolPrefixError(rule: string, preset: string | undefined): string | undefined {
  const printed = splitPrinted(rule);
  if (printed === undefined) {
    return undefined;
  }
  const presetTools = preset === undefined ? undefined : PRESET_TOOLS[preset];
  const valid = (toolsOf(printed.rest) ?? []).filter((tool) =>
    (presetTools ?? Object.values(PRESET_TOOLS).flat()).includes(tool),
  );
  if (valid.includes(printed.tool)) {
    return undefined;
  }
  const printedForms = valid.map((tool) => `${tool}/${printed.rest}`);
  const advice = printedForms.length === 0 ? '' : ` or as ${printedForms.join(' or ')}`;
  return `unknown tool prefix "${printed.tool}" for ${printed.rest}: use the rule bare${advice}`;
}
