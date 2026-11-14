export function stepsOf(...items) {
  return items.flat().filter((item) => typeof item === 'string' && item !== '');
}

export function lineRanges(blocks) {
  return blocks
    .map(({ startLine, endLine }) => `${String(startLine)}-${String(endLine)}`)
    .join(', ');
}

export function readStep(place, measure) {
  return measure === '' ? `Read ${place}.` : `Read ${place}: ${measure}.`;
}

export function amount(value, unit, limit) {
  if (value === undefined) {
    return '';
  }
  return limit === undefined
    ? `${String(value)} ${unit}`
    : `${String(value)} ${unit}, limit ${String(limit)}`;
}
