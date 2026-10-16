import { leadingSpaces } from '../../../shared/conventions/lines.mjs';

const MIN_STRINGS = 3;
const TOKEN =
  /#[^\n]*|('''|""")(?:\\[\s\S]|(?!\1)[\s\S])*(?:\1|$)|(["'])((?:\\.|(?!\2)[^\\\n])*)\2/g;
const BLOCK_OPENER =
  /^\s*(?:async\s+)?(?:def|class|if|elif|else|for|while|try|except|finally|with|match|case)\b.*:\s*(?:#.*)?$/;
const COMMENT_OR_BLANK = /^\s*(?:#.*)?$/;
const OTHER_QUOTE = { "'": '"', '"': "'" };

function isEvidence(content, quote) {
  return !content.includes(OTHER_QUOTE[quote]) && !content.includes(`\\${quote}`);
}

function quoteOf(match) {
  const [, , quote, content] = match;
  return quote !== undefined && isEvidence(content, quote) ? quote : undefined;
}

export function stringQuotes(text) {
  const quotes = [...text.matchAll(TOKEN)].map(quoteOf).filter((quote) => quote !== undefined);
  const single = quotes.filter((quote) => quote === "'").length;
  const double = quotes.length - single;
  if (quotes.length < MIN_STRINGS || single === double) {
    return undefined;
  }
  return single > double ? 'single' : 'double';
}

function blockSteps(lines) {
  return lines
    .slice(0, -1)
    .flatMap((line, index) =>
      BLOCK_OPENER.test(line) ? [leadingSpaces(lines[index + 1]) - leadingSpaces(line)] : [],
    );
}

export function indentationWidth(text) {
  const lines = text.split(/\r?\n/);
  if (lines.some((line) => line.startsWith('\t'))) {
    return undefined;
  }
  const steps = blockSteps(lines.filter((line) => !COMMENT_OR_BLANK.test(line)));
  const two = steps.filter((step) => step === 2).length;
  const four = steps.filter((step) => step === 4).length;
  if (two === four) {
    return undefined;
  }
  return two > four ? '2' : '4';
}
