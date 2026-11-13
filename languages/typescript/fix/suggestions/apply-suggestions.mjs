import { isRuleSelected, suggestionName } from './suggestion-rules.mjs';

const BYTE_ORDER_MARK = '﻿';

export function singleSuggestionEdit(message) {
  const { ruleId, suggestions, fatal, fix } = message;
  if (fatal === true || fix !== undefined) {
    return undefined;
  }
  if (!Array.isArray(suggestions) || suggestions.length !== 1) {
    return undefined;
  }
  const edit = suggestions[0]?.fix;
  const [start, end] = edit?.range ?? [];
  const valid = Number.isInteger(start) && Number.isInteger(end) && start <= end;
  return valid && typeof edit.text === 'string'
    ? { start, end, text: edit.text, rule: ruleId, line: message.line }
    : undefined;
}

function nonOverlapping(edits) {
  const kept = [];
  for (const edit of edits.toSorted((left, right) => left.start - right.start)) {
    const previous = kept.at(-1);
    if (previous === undefined || edit.start >= previous.end) {
      kept.push(edit);
    }
  }
  return kept;
}

export function applySuggestions({ text, messages, selectedRules = [] }) {
  const marked = text.startsWith(BYTE_ORDER_MARK);
  const body = marked ? text.slice(BYTE_ORDER_MARK.length) : text;
  const edits = nonOverlapping(
    messages
      .filter(({ ruleId }) => isRuleSelected(ruleId, selectedRules))
      .map(singleSuggestionEdit)
      .filter((edit) => edit !== undefined && edit.end <= body.length),
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
