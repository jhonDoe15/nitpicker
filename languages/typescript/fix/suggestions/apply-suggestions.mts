import { isRuleSelected, suggestionName, type LintMessage } from './typed/suggestion-views.mts';

const BYTE_ORDER_MARK = '﻿';

export type SuggestionEdit = {
  readonly start: number;
  readonly end: number;
  readonly text: string;
  readonly rule: string | undefined;
  readonly line: number | undefined;
};

type AppliedSuggestion = { readonly rule: string; readonly line: number | undefined };

export function singleSuggestionEdit(message: LintMessage): SuggestionEdit | undefined {
  const { ruleId, suggestions, fatal, fix } = message;
  if (fatal === true || fix !== undefined) {
    return undefined;
  }
  if (suggestions?.length !== 1) {
    return undefined;
  }
  const edit = suggestions[0]?.fix;
  const [start, end] = edit?.range ?? [];
  const valid =
    typeof start === 'number' &&
    typeof end === 'number' &&
    Number.isInteger(start) &&
    Number.isInteger(end) &&
    start <= end;
  return valid && typeof edit?.text === 'string'
    ? { start, end, text: edit.text, rule: ruleId, line: message.line }
    : undefined;
}

function nonOverlapping(edits: readonly SuggestionEdit[]): SuggestionEdit[] {
  const kept: SuggestionEdit[] = [];
  for (const edit of edits.toSorted((left, right) => left.start - right.start)) {
    const previous = kept.at(-1);
    if (previous === undefined || edit.start >= previous.end) {
      kept.push(edit);
    }
  }
  return kept;
}

export function applySuggestions({
  text,
  messages,
  selectedRules = [],
}: {
  readonly text: string;
  readonly messages: readonly LintMessage[];
  readonly selectedRules?: readonly string[];
}): { readonly text: string; readonly applied: readonly AppliedSuggestion[] } {
  const marked = text.startsWith(BYTE_ORDER_MARK);
  const body = marked ? text.slice(BYTE_ORDER_MARK.length) : text;
  const edits = nonOverlapping(
    messages
      .filter(({ ruleId }) => isRuleSelected(ruleId, selectedRules))
      .map(singleSuggestionEdit)
      .filter((edit): edit is SuggestionEdit => edit !== undefined && edit.end <= body.length),
  );
  let result = body;
  for (const edit of edits.toReversed()) {
    result = `${result.slice(0, edit.start)}${edit.text}${result.slice(edit.end)}`;
  }
  return {
    text: marked ? `${BYTE_ORDER_MARK}${result}` : result,
    applied: edits.map(({ rule, line }) => ({ rule: suggestionName(rule), line })),
  };
}
