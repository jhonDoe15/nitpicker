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
 * A rule's entry. `analyzers` says who can report it (per preset, the analyzer names `disable`
 * takes); `findingTools` lists the tool names its findings print when they differ from `tool`;
 * `pattern` makes the entry stand for every rule that matches it, and `samples` names such rules.
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

/** `words` joined with commas and a final "and". */
export function joinedWords(words) {
  return words.length < 2 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`;
}

/**
 * The config list and rule that accept a finding of the entry in `preset`, or undefined when no
 * exception applies there. `presetKeys` and `presetRules` name the list and the rule a preset uses
 * instead of the entry's own; `presetNotes` says why a preset has no exception for the rule.
 */
export function exceptionFor({ exception }, preset) {
  if (exception.key === undefined || exception.presetNotes?.[preset] !== undefined) {
    return undefined;
  }
  return {
    ...exception,
    key: exception.presetKeys?.[preset] ?? exception.key,
    rule: exception.presetRules?.[preset] ?? exception.rule,
  };
}

function routeText(route) {
  return exceptionSentence(`\`${exceptionSnippet(route)}\``, route.key);
}

function withPresets(presets, text) {
  const titles = joinedWords(presets.map((preset) => PRESET_TITLES[preset]));
  return `With the ${titles} ${presets.length === 1 ? 'preset' : 'presets'}: ${text}`;
}

function presetSentences(exception, presets) {
  const own = routeText(exception);
  const routed = presets.filter((preset) => exceptionFor({ exception }, preset) !== undefined);
  const byRoute = Map.groupBy(routed, (preset) => routeText(exceptionFor({ exception }, preset)));
  const byNote = Map.groupBy(
    presets.filter((preset) => exception.presetNotes?.[preset] !== undefined),
    (preset) => exception.presetNotes[preset],
  );
  return [
    ...[...byRoute]
      .filter(([text]) => text !== own)
      .map(([text, group]) => withPresets(group, text)),
    ...[...byNote].map(([note, group]) => withPresets(group, note)),
  ];
}

/** How to add an exception for the entry in each of `presets`, or why it has none. */
export function exceptionAdvice({ exception }, presets = []) {
  if (exception.key === undefined) {
    return exception.note;
  }
  return [
    routeText(exception),
    ...presetSentences(exception, presets),
    ...(exception.note === undefined ? [] : [exception.note]),
  ].join(' ');
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
