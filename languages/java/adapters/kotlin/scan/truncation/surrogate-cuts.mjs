const CUT_RULE = 'SurrogateSplittingCut';

const CUT_MESSAGES = {
  [CUT_RULE]:
    'Cut on code points or grapheme clusters, or step back over a high surrogate: `if ' +
    '(Character.isHighSurrogate(text[end - 1])) end--` before `substring(0, end)`, or ' +
    '`text.offsetByCodePoints(0, count)`. `take(n)` and `substring(0, n)` count UTF-16 chars, so a cut ' +
    'between the two halves of a surrogate pair (an emoji, many CJK characters) leaves a lone surrogate ' +
    'that renders as a replacement character and fails strict UTF-8 encoding. Text that is ASCII by ' +
    'construction (ids, hashes, base64) is fine.',
};

const GUARD = /\bif\s*\(\s*([A-Za-z_]\w*)\s*\.\s*length\s*>=?\s*([A-Za-z_][\w.]*|\d+)\s*\)/g;
const SURROGATE_AWARE =
  /isHighSurrogate|isLowSurrogate|isSurrogate|codePoint|BreakIterator|offsetByCodePoints/;
const ASCII_NAME = /hash|hex|base64|uuid|sha\d*|digest|slug|token|^id$|Id$/i;
const WINDOW = 240;
const ARGUMENT = String.raw`([^()]*(?:\([^()]*\)[^()]*)*)`;
const FIRST_CHARACTERS = new Set(['0', '1']);

function cutAfter(window, name) {
  const cut = new RegExp(
    String.raw`(?<![\w$])${name}\s*\??\.\s*(?:take\s*\(\s*${ARGUMENT}\)|` +
      String.raw`substring\s*\(\s*0\s*,\s*${ARGUMENT}\)|subSequence\s*\(\s*0\s*,\s*${ARGUMENT}\))`,
  );
  const match = cut.exec(window);
  return match === null
    ? undefined
    : { index: match.index, end: (match[1] ?? match[2] ?? match[3]).trim() };
}

export function surrogateSplittingCuts(scanned) {
  const { code } = scanned;
  if (SURROGATE_AWARE.test(code)) {
    return [];
  }
  return [...code.matchAll(GUARD)].flatMap((guard) => {
    const [text, name, bound] = guard;
    const start = guard.index + text.length;
    const window = code.slice(start, start + WINDOW).split(/\n\s*\n/)[0];
    const cut = ASCII_NAME.test(name) ? undefined : cutAfter(window, name);
    return cut !== undefined && !FIRST_CHARACTERS.has(cut.end) && cut.end.includes(bound)
      ? [{ rule: CUT_RULE, offset: start + cut.index }]
      : [];
  });
}

export const kotlinSourceRules = { messages: CUT_MESSAGES, main: [surrogateSplittingCuts] };
