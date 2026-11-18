const NUMBER = String.raw`(?:\d{1,3}(?:,\d{3})+|\d+)`;
const SEPARATOR = String.raw`(?:,\s*(?:and\s+)?|\s+and\s+)`;
const COUNTED = String.raw`(?!\s+(?:more|times?|others?|occurrences?)\b)`;
const LINE_REFERENCE = new RegExp(
  String.raw`\bline(?:s|\(s\))?:?\s*${NUMBER}(?:${SEPARATOR}${NUMBER}${COUNTED})*\b`,
  'gu',
);

export function withoutLineReferences(text) {
  return text.replace(LINE_REFERENCE, 'line');
}
