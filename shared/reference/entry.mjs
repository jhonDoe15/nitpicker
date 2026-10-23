import { exceptionEntryText, exceptionSentence } from '../messages/exception-sentence.mjs';

export const PRESET_TITLES = {
  typescript: 'TypeScript',
  javascript: 'JavaScript',
  java: 'Java',
  kotlin: 'Kotlin',
  python: 'Python',
};

export const PRESETS = Object.keys(PRESET_TITLES);

const PATH_PLACEHOLDER = '<path>';
const NOT_ANCHOR = /[^a-z0-9]+/gu;
const EDGE_DASHES = /^-+|-+$/gu;

/** The stable fragment of a rule's entry: lowercase letters and digits joined by dashes. */
export function anchorOf(tool, rule) {
  return `${tool}-${rule}`.toLowerCase().replaceAll(NOT_ANCHOR, '-').replaceAll(EDGE_DASHES, '');
}

/**
 * A rule's entry. `presets` and `analyzers` say who can report it (the preset names and the analyzer
 * names `disable` takes); `findingTools` lists the tool names its findings print when they differ
 * from `tool`; `pattern` makes the entry stand for every rule that matches it.
 */
export function ruleEntry({ tool, rule, ...fields }) {
  return { id: `${tool}/${rule}`, tool, rule, anchor: anchorOf(tool, rule), ...fields };
}

/** The `exceptions` entry of a rule, as JSON, with the path and reason left for the reader to fill. */
export function exceptionSnippet({ rule, function: functionName, name, packages }) {
  return exceptionEntryText({
    rule,
    glob: PATH_PLACEHOLDER,
    ...(packages === undefined ? {} : { packages: ['<package>'] }),
    ...(functionName === undefined ? {} : { function: '<function>' }),
    ...(name === undefined ? {} : { name: '<name>' }),
  });
}

/** The sentence that tells how to add an exception for the entry, or why it has none. */
export function exceptionAdvice({ exception }) {
  if (exception.key === undefined) {
    return exception.note;
  }
  const snippet = exceptionSnippet(exception);
  const sentences = [
    exceptionSentence(`\`${snippet}\``, exception.key),
    ...Object.entries(exception.presetKeys ?? {}).map(
      ([preset, key]) => `With the ${PRESET_TITLES[preset]} preset, add it to "${key}" instead.`,
    ),
    ...(exception.note === undefined ? [] : [exception.note]),
  ];
  return sentences.join(' ');
}

function ownException({ tool, rule, exceptionKey = 'exceptions', exceptionRule }) {
  return { key: exceptionKey, rule: exceptionRule ?? `${tool}/${rule}` };
}

/**
 * The entries of `rows`, each `[rule, summary, allowed, extra]`, sharing the fields of `defaults`.
 * Unless `extra` names an `exception`, the rule is lifted by `defaults.exceptionKey` with the rule
 * as `<tool>/<rule>`, or as `defaults.exceptionRule(rule)` when that is given.
 */
export function entriesFrom({ exceptionKey, exceptionRule, ...defaults }, rows) {
  return rows.map(([rule, summary, allowed, extra = {}]) =>
    ruleEntry({
      ...defaults,
      rule,
      summary,
      ...(allowed === undefined ? {} : { allowed }),
      exception: ownException({
        tool: defaults.tool,
        rule,
        exceptionKey,
        exceptionRule: exceptionRule?.(rule),
      }),
      ...extra,
    }),
  );
}
