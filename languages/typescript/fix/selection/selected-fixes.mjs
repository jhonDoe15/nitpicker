import { singleSuggestionEdit } from '../suggestions/apply-suggestions.mjs';
import { suggestionName } from '../suggestions/suggestion-rules.mjs';

const BOM = '﻿';
const ESLINT_PREFIXES = ['eslint/', 'eslint-lint/'];

export function selectedEslintRules(selectedRules) {
  return selectedRules.flatMap((name) => {
    const prefix = ESLINT_PREFIXES.find((candidate) => name.startsWith(candidate));
    return prefix === undefined ? [] : [name.slice(prefix.length)];
  });
}

function fixEdit({ fix }) {
  const [start, end] = fix?.range ?? [];
  return Number.isInteger(start) && Number.isInteger(end) && start <= end
    ? { start, end, text: fix.text }
    : undefined;
}

function editsOf(messages, ruleIds) {
  return messages
    .filter(({ ruleId }) => ruleIds.includes(ruleId))
    .flatMap((message) => {
      const fix = fixEdit(message);
      const suggestion = fix === undefined ? singleSuggestionEdit(message) : undefined;
      return fix === undefined && suggestion === undefined
        ? []
        : [{ ...(fix ?? suggestion), suggested: fix === undefined, message }];
    })
    .toSorted((left, right) => left.start - right.start || left.end - right.end);
}

export function selectedOutput(source, messages, ruleIds) {
  const bom = source.startsWith(BOM) ? BOM : '';
  const body = source.slice(bom.length);
  const applied = [];
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
