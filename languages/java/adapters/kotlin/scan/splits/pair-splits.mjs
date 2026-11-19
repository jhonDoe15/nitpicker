import { lineAt, lineStart } from '../kotlin-source.mjs';

const PAIR_RULE = 'PairSplitDropsRest';

const PAIR_MESSAGES = {
  [PAIR_RULE]:
    'Cut at the first separator: `text.substringBefore(":")` and `text.substringAfter(":")`, or ' +
    '`text.split(":", limit = 2)` and read both parts. `split(":")` returns every part, so `[1]` or a ' +
    'two-name destructuring keeps the second one and silently drops everything after the next separator, ' +
    'which is where a URL, a message with colons or a base64 `=` lives. A format that cannot hold the ' +
    'separator twice takes an exception.',
};

const BLANK_SPLIT = /\.\s*split\s*\(\s*(["']) *\1\s*\)/g;
const PAIR_SPLIT = /^\.\s*split\s*\(\s*(?:"[:=]"|':'|'=')\s*\)$/;
const SECOND_PART = /^\s*\??\[\s*1\s*\]/;
const STATEMENT_END = /^[ \t]*(?:\n|;|$)/;
const DESTRUCTURING = /\bva[lr]\s*\(\s*(_|[A-Za-z]\w*)\s*,\s*(_|[A-Za-z]\w*)\s*\)\s*=([^\n]*)$/;
const CLOCK_NAME = /^(?:h|m|s|hh|mm|ss|hours?|minutes?|mins?|seconds?|secs?|hrs?)$/i;
const CLOCK_SOURCE = /time|clock|duration|hhmm|ratio|aspect/i;

function isClockPair({ names, receiver }) {
  return names.some((name) => CLOCK_NAME.test(name)) || CLOCK_SOURCE.test(receiver);
}

function receiverBefore(code, index) {
  return code.slice(lineStart(code, index), index);
}

function destructuredPair(code, index) {
  const before = DESTRUCTURING.exec(receiverBefore(code, index));
  return before === null ? undefined : { names: [before[1], before[2]], receiver: before[3] };
}

export function pairSplits(scanned) {
  const { code } = scanned;
  return [...code.matchAll(BLANK_SPLIT)].flatMap((match) => {
    const end = match.index + match[0].length;
    if (!PAIR_SPLIT.test(scanned.source.slice(match.index, end))) {
      return [];
    }
    const rest = code.slice(end);
    const line = lineAt(code, lineStart(code, match.index));
    const indexed = SECOND_PART.test(rest);
    const pair = indexed ? undefined : destructuredPair(code, match.index);
    const receiver = indexed ? line.slice(0, line.indexOf(match[0])) : pair?.receiver;
    const reported =
      (indexed || (pair !== undefined && STATEMENT_END.test(rest))) &&
      !isClockPair({ names: pair?.names ?? [], receiver: receiver ?? '' });
    return reported ? [{ rule: PAIR_RULE, offset: match.index }] : [];
  });
}

export const kotlinSourceRules = { messages: PAIR_MESSAGES, main: [pairSplits] };
