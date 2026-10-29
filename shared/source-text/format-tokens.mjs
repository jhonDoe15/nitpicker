const TOKEN = /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[\p{L}\p{N}_$]+|=>|\S/gu;
const QUOTE_RESTYLING_FILE = /\.(?:py|pyi|[cm]?[jt]sx?|vue|svelte)$/u;
const CLOSERS = new Set([')', ']', '}']);
const WORD = /^[\p{L}\p{N}_$]+$/u;

export function changesQuoteStyle(filePath) {
  return QUOTE_RESTYLING_FILE.test(filePath);
}

function tokenText(raw, quoteAgnostic) {
  const quote = raw[0];
  if (!quoteAgnostic || raw.length < 2 || (quote !== '"' && quote !== "'")) {
    return raw;
  }
  return `\0${raw.slice(1, -1).replaceAll(/\\(["'])/gu, '$1')}`;
}

export function lineTokens(text, { line, quoteAgnostic }) {
  return [...text.matchAll(TOKEN)]
    .map(([raw]) => ({ text: tokenText(raw, quoteAgnostic), line }))
    .filter((token) => token.text !== ';');
}

const ARROW_PARAMETER = [
  (text) => text === '(',
  (text) => WORD.test(text),
  (text) => text === ')',
  (text) => text === '=>',
];

export function parenthesesAroundArrowParameter(texts, pattern) {
  return new Set(
    texts.flatMap((_, index) =>
      pattern.every(
        (matches, offset) => index + offset < texts.length && matches(texts[index + offset]),
      )
        ? [index, index + 2]
        : [],
    ),
  );
}

export function formattingFree(tokens) {
  const texts = tokens.map(({ text }) => text);
  const parentheses = parenthesesAroundArrowParameter(texts, ARROW_PARAMETER);
  return tokens.filter(
    (token, index) =>
      !(token.text === ',' && CLOSERS.has(texts[index + 1])) && !parentheses.has(index),
  );
}

export function formatAgnosticText(text, filePath) {
  return formattingFree(lineTokens(text, { line: 0, quoteAgnostic: changesQuoteStyle(filePath) }))
    .map((token) => token.text)
    .join(' ');
}
