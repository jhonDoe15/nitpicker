import { exceptionEntryText, exceptionSentence } from '../messages/exception-sentence.mts';
import type {
  EntryDefaults,
  EntryFields,
  EntryRow,
  ExceptionRoute,
  RuleEntry,
} from './typed/entry-types.mts';

const SENTENCE_END = /[.!?]$/u;

export function asSentence(text: string): string {
  const trimmed = text.trim();
  const capitalized = `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}`;
  return SENTENCE_END.test(capitalized) ? capitalized : `${capitalized}.`;
}

export const PRESET_TITLES: Readonly<Record<string, string>> = {
  typescript: 'TypeScript',
  javascript: 'JavaScript',
  java: 'Java',
  kotlin: 'Kotlin',
  python: 'Python',
};

export const PRESETS: string[] = Object.keys(PRESET_TITLES);

const PATH_PLACEHOLDER = '<path>';
const NOT_ANCHOR = /[^a-z0-9]+/gu;
const EDGE_DASHES = /^-+|-+$/gu;

export function anchorOf(tool: string, rule: string): string {
  return `${tool}-${rule}`.toLowerCase().replaceAll(NOT_ANCHOR, '-').replaceAll(EDGE_DASHES, '');
}

export function ruleEntry({ tool, rule, ...fields }: EntryFields): RuleEntry {
  return { id: `${tool}/${rule}`, tool, rule, anchor: anchorOf(tool, rule), ...fields };
}

export function exceptionSnippet({
  rule,
  function: functionName,
  name,
  packages,
}: ExceptionRoute): string {
  return exceptionEntryText({
    rule: rule ?? '',
    glob: PATH_PLACEHOLDER,
    ...(packages === undefined ? {} : { packages: ['<package>'] }),
    ...(functionName === undefined ? {} : { function: '<function>' }),
    ...(name === undefined ? {} : { name: '<name>' }),
  });
}

export function presetTitle(preset: string): string {
  return PRESET_TITLES[preset] ?? preset;
}

export function joinedWords(words: readonly string[]): string {
  return words.length < 2
    ? words.join('')
    : `${words.slice(0, -1).join(', ')} and ${words.slice(-1).join('')}`;
}

export function exceptionFor(
  { exception }: { readonly exception: ExceptionRoute },
  preset: string,
): ExceptionRoute | undefined {
  if (exception.key === undefined || exception.presetNotes?.[preset] !== undefined) {
    return undefined;
  }
  const nativeRule = exception.presetRules?.[preset];
  const { packages, ...route } = exception;
  return {
    ...route,
    ...(nativeRule === undefined && packages !== undefined ? { packages } : {}),
    key: exception.presetKeys?.[preset] ?? exception.key,
    rule: nativeRule ?? exception.rule,
  };
}

function routeText(route: ExceptionRoute): string {
  return exceptionSentence(`\`${exceptionSnippet(route)}\``, route.key);
}

function withPresets(presets: readonly string[], text: string): string {
  const titles = joinedWords(presets.map(presetTitle));
  return `With the ${titles} ${presets.length === 1 ? 'preset' : 'presets'}: ${text}`;
}

function presetSentences(exception: ExceptionRoute, presets: readonly string[]): string[] {
  const own = routeText(exception);
  const routed = presets.flatMap((preset) => {
    const route = exceptionFor({ exception }, preset);
    return route === undefined ? [] : [{ preset, text: routeText(route) }];
  });
  const byRoute = Map.groupBy(routed, ({ text }) => text);
  const noted = presets.flatMap((preset) => {
    const note = exception.presetNotes?.[preset];
    return note === undefined ? [] : [{ preset, text: note }];
  });
  const byNote = Map.groupBy(noted, ({ text }) => text);
  return [
    ...[...byRoute]
      .filter(([text]) => text !== own)
      .map(([text, group]) =>
        withPresets(
          group.map(({ preset }) => preset),
          text,
        ),
      ),
    ...[...byNote].map(([note, group]) =>
      withPresets(
        group.map(({ preset }) => preset),
        note,
      ),
    ),
  ];
}

export function exceptionAdvice(
  { exception }: { readonly exception: ExceptionRoute },
  presets: readonly string[] = [],
): string | undefined {
  if (exception.key === undefined) {
    return exception.note;
  }
  return [
    routeText(exception),
    ...presetSentences(exception, presets),
    ...(exception.note === undefined ? [] : [exception.note]),
  ].join(' ');
}

function ownException({
  tool,
  rule,
  exceptionKey = 'exceptions',
  exceptionRule,
}: {
  readonly tool: string;
  readonly rule: string;
  readonly exceptionKey: string | undefined;
  readonly exceptionRule: string | undefined;
}): ExceptionRoute {
  return { key: exceptionKey, rule: exceptionRule ?? `${tool}/${rule}` };
}

export function entriesFrom(
  { exceptionKey, exceptionRule, ...defaults }: EntryDefaults,
  rows: readonly EntryRow[],
): RuleEntry[] {
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
