const BOM = '\uFEFF';
const COMMENT_OR_STRING = /"(?:[^"\\]|\\[\s\S])*"?|\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$)/gu;
const COMMA_OR_STRING = /"(?:[^"\\]|\\[\s\S])*"?|,(?=\s*[\]}])/gu;

function withoutComments(text) {
  return text.replace(COMMENT_OR_STRING, (match) => (match.startsWith('"') ? match : ''));
}

function withoutTrailingCommas(text) {
  return text.replace(COMMA_OR_STRING, (match) => (match === ',' ? '' : match));
}

export function parseJsonc(text) {
  const content = text.startsWith(BOM) ? text.slice(1) : text;
  return JSON.parse(withoutTrailingCommas(withoutComments(content)));
}
