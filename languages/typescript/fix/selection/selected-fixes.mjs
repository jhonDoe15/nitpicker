const BOM = '﻿';
const ESLINT_PREFIX = 'eslint/';

export function selectedEslintRules(selectedRules) {
  return selectedRules
    .filter((name) => name.startsWith(ESLINT_PREFIX))
    .map((name) => name.slice(ESLINT_PREFIX.length));
}

function fixesOf(messages, ruleIds) {
  return messages
    .filter(({ ruleId, fix }) => ruleIds.includes(ruleId) && Array.isArray(fix?.range))
    .map(({ fix }) => fix)
    .sort((left, right) => left.range[0] - right.range[0] || left.range[1] - right.range[1]);
}

export function selectedOutput(source, messages, ruleIds) {
  const bom = source.startsWith(BOM) ? BOM : '';
  const text = source.slice(bom.length);
  let output = '';
  let applied = 0;
  let lastPosition = -Infinity;
  for (const { range, text: replacement } of fixesOf(messages, ruleIds)) {
    const [start, end] = range;
    if (lastPosition >= start || start > end) {
      continue;
    }
    output += text.slice(applied, start) + replacement;
    applied = end;
    lastPosition = end;
  }
  return applied === 0 && lastPosition === -Infinity
    ? undefined
    : bom + output + text.slice(applied);
}
