import { majorityStep } from '../../../shared/conventions/lines.mjs';

const MIN_STRINGS = 3;
const SPACE_STEPS = [2, 4];
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

function blockStep(opener, next) {
  const indent = /^[ \t]*/.exec(opener)[0];
  const deeper = /^[ \t]*/.exec(next)[0];
  if (!deeper.startsWith(indent)) {
    return undefined;
  }
  const added = deeper.slice(indent.length);
  return added === '\t' ? 'tab' : added.length;
}

function blockSteps(lines) {
  return lines
    .slice(0, -1)
    .flatMap((line, index) => (BLOCK_OPENER.test(line) ? [blockStep(line, lines[index + 1])] : []));
}

export function indentationWidth(text) {
  const steps = blockSteps(text.split(/\r?\n/).filter((line) => !COMMENT_OR_BLANK.test(line)));
  const tabs = steps.filter((step) => step === 'tab').length;
  const spaces = majorityStep(steps);
  if (spaces === undefined) {
    return tabs > 0 && !SPACE_STEPS.some((step) => steps.includes(step)) ? 'tab' : undefined;
  }
  return steps.filter((step) => step === Number(spaces)).length > tabs ? spaces : undefined;
}
