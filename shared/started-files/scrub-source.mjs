const TOKEN =
  /\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$)|"(?:\\[\s\S]|[^"\\])*(?:"|\\?$)|'(?:\\[\s\S]|[^'\\])*(?:'|\\?$)|`(?:\\[\s\S]|[^`\\])*(?:`|\\?$)/gu;
const QUOTES = new Set(['"', "'", '`']);

function blanked(text) {
  return text.replace(/[^\n]/gu, ' ');
}

export function scrubSource(text, { keepStrings }) {
  return text.replace(TOKEN, (token) =>
    keepStrings && QUOTES.has(token[0]) ? token : blanked(token),
  );
}
