import { singleSuggestionEdit, type SuggestionEdit } from '../suggestions/apply-suggestions.mts';
import { suggestionName, type LintMessage } from '../suggestions/typed/suggestion-views.mts';

type Edit = {
  readonly start: number;
  readonly end: number;
  readonly text: string;
  readonly suggested: boolean;
  readonly message: LintMessage;
};

const BOM = '﻿';
const ESLINT_PREFIXES = ['eslint/', 'eslint-lint/'];

export function selectedEslintRules(selectedRules: readonly string[]): string[] {
  return selectedRules.flatMap((name) => {
    const prefix = ESLINT_PREFIXES.find((candidate) => name.startsWith(candidate));
    return prefix === undefined ? [] : [name.slice(prefix.length)];
  });
}

function fixEdit({ fix }: LintMessage): Pick<SuggestionEdit, 'start' | 'end' | 'text'> | undefined {
  const [start, end] = fix?.range ?? [];
  return typeof start === 'number' &&
    typeof end === 'number' &&
    Number.isInteger(start) &&
    Number.isInteger(end) &&
    start <= end &&
    typeof fix?.text === 'string'
    ? { start, end, text: fix.text }
    : undefined;
}

function editsOf(messages: readonly LintMessage[], ruleIds: readonly string[]): Edit[] {
  return messages
    .filter(({ ruleId }) => ruleId !== undefined && ruleIds.includes(ruleId))
    .flatMap((message): Edit[] => {
      const fix = fixEdit(message);
      const suggestion = fix === undefined ? singleSuggestionEdit(message) : undefined;
      const edit = fix ?? suggestion;
      return edit === undefined ? [] : [{ ...edit, suggested: fix === undefined, message }];
    })
    .toSorted((left, right) => left.start - right.start || left.end - right.end);
}

export function selectedOutput(
  source: string,
  messages: readonly LintMessage[],
  ruleIds: readonly string[],
): {
  readonly text: string | undefined;
  readonly suggested: readonly { readonly rule: string; readonly line: number | undefined }[];
} {
  const bom = source.startsWith(BOM) ? BOM : '';
  const body = source.slice(bom.length);
  const applied: Edit[] = [];
  let output = '';
  let position = 0;
  let lastEnd = -Infinity;
  for (const edit of editsOf(messages, ruleIds)) {
    if (lastEnd < edit.start) {
      output += body.slice(position, edit.start) + edit.text;
      position = edit.end;
      lastEnd = edit.end;
      applied.push(edit);
    }
  }
  return {
    text: applied.length === 0 ? undefined : bom + output + body.slice(position),
    suggested: applied
      .filter(({ suggested }) => suggested)
      .map(({ message }) => ({ rule: suggestionName(message.ruleId), line: message.line })),
  };
}
