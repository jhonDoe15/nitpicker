import {
  bracketPairs,
  isCloseBracket,
  isOpenBracket,
  newlines,
  SYNTAXES,
  scan,
} from './scanner.mjs';

const PYTHON_KEYWORDS = new Set(
  (
    'False None True and as assert async await break class continue def del elif else except ' +
    'finally for from global if import in is lambda nonlocal not or pass raise return try ' +
    'while with yield'
  ).split(' '),
);
const KOTLIN_KEYWORDS = new Set(
  (
    'as break catch class continue do else false finally for fun if import in interface is ' +
    'null object package return super this throw true try typealias typeof val var when while'
  ).split(' '),
);
const JAVA_KEYWORDS = new Set(
  (
    'abstract assert boolean break byte case catch char class continue default do double else ' +
    'enum extends final finally float for if implements import instanceof int interface long ' +
    'native new package private protected public return short static super switch ' +
    'synchronized this throw throws try void volatile while var record yield'
  ).split(' '),
);
const LITERAL_WORDS = new Set(['False', 'None', 'True', 'false', 'null', 'true']);
const DATA_PUNCTUATION = new Set([',', ':', '-', '+']);
const DATA_KINDS = new Set(['string', 'number', 'comment']);
const KOTLIN_DATA_CALL = /^(?:\w*Of|Pair|Triple)$/u;
const JAVA_DATA_CALL = /^(?:of|asList|ofEntries|entry)$/u;
const CONTINUATION = /\\[ \t]*\r?\n[ \t]*$/u;
const OPERAND_ENDS = new Set([')', ']', '}']);
const OPERAND_KINDS = new Set(['string', 'number']);
const UNDERSCORE = '_ ';
const ZERO = '0 ';

function isAdjacent(tokens, index, text) {
  const previous = tokens[index - 1];
  return previous?.text === text && previous.end === tokens[index].start;
}

function openerOf(tokens, close) {
  let depth = 0;
  for (let index = close; index >= 0; index -= 1) {
    depth += Number(isCloseBracket(tokens[index])) - Number(isOpenBracket(tokens[index]));
    if (depth === 0) {
      return index;
    }
  }
  return -1;
}

function opensWhenTable(tokens, index) {
  if (tokens[index].text !== '{' || tokens[index - 1]?.text !== ')') {
    return false;
  }
  return tokens[openerOf(tokens, index - 1) - 1]?.text === 'when';
}

function isOperand(token, keywords) {
  if (token === undefined) {
    return false;
  }
  const isName = token.kind === 'identifier' && !keywords.has(token.text);
  return isName || OPERAND_KINDS.has(token.kind) || OPERAND_ENDS.has(token.text);
}

const LANGUAGES = {
  python: {
    syntax: SYNTAXES.python,
    keywords: PYTHON_KEYWORDS,
    statementWords: new Set('import from __all__'.split(' ')),
    opensData: (tokens, index) =>
      tokens[index].text === '{' || !isOperand(tokens[index - 1], PYTHON_KEYWORDS),
    isDataWord: () => false,
  },
  kotlin: {
    syntax: SYNTAXES.kotlin,
    keywords: KOTLIN_KEYWORDS,
    statementWords: new Set('import package'.split(' ')),
    opensData: (tokens, index) =>
      (tokens[index].text === '(' && KOTLIN_DATA_CALL.test(tokens[index - 1]?.text ?? '')) ||
      opensWhenTable(tokens, index),
    isDataWord: (token) => token.text === 'to' || KOTLIN_DATA_CALL.test(token.text),
  },
  java: {
    syntax: SYNTAXES.java,
    keywords: JAVA_KEYWORDS,
    statementWords: new Set('import package'.split(' ')),
    opensData: (tokens, index) =>
      (tokens[index].text === '(' && JAVA_DATA_CALL.test(tokens[index - 1]?.text ?? '')) ||
      (tokens[index].text === '{' && ['=', ']'].includes(tokens[index - 1]?.text)),
    isDataWord: (token) => JAVA_DATA_CALL.test(token.text),
  },
};

function isDottedName(tokens, index) {
  const token = tokens[index];
  if (token.kind === 'punctuation') {
    return (
      token.text === '.' &&
      tokens[index - 1]?.kind === 'identifier' &&
      tokens[index + 1]?.kind === 'identifier'
    );
  }
  return (
    token.kind === 'identifier' &&
    (tokens[index - 1]?.text === '.' || tokens[index + 1]?.text === '.')
  );
}

function isDataToken(tokens, index, language) {
  const token = tokens[index];
  if (isDottedName(tokens, index) || (token.text === '>' && isAdjacent(tokens, index, '-'))) {
    return true;
  }
  if (token.kind === 'punctuation') {
    return DATA_PUNCTUATION.has(token.text);
  }
  const isWord = token.kind === 'identifier';
  return (
    DATA_KINDS.has(token.kind) ||
    (isWord && (LITERAL_WORDS.has(token.text) || language.isDataWord(token)))
  );
}

function holdsOnlyData(tokens, [open, close], language) {
  return tokens.slice(open + 1, close).every((token, offset) => {
    const index = open + 1 + offset;
    if (isOpenBracket(token)) {
      return language.opensData(tokens, index);
    }
    return isCloseBracket(token) || isDataToken(tokens, index, language);
  });
}

function statementStarts(text, tokens) {
  const starts = [];
  let depth = 0;
  let previous;
  for (const [index, token] of tokens.entries()) {
    if (token.kind === 'comment') {
      continue;
    }
    const gap = previous === undefined ? '' : text.slice(tokens[previous].end, token.start);
    const separated = gap.includes('\n') && !CONTINUATION.test(gap);
    if (previous === undefined || (depth === 0 && (separated || tokens[previous].text === ';'))) {
      starts.push(index);
    }
    depth = Math.max(0, depth + Number(isOpenBracket(token)) - Number(isCloseBracket(token)));
    previous = index;
  }
  return starts;
}

function importRanges(text, tokens, language) {
  const starts = statementStarts(text, tokens);
  return starts.flatMap((from, position) => {
    const isImport =
      tokens[from].kind === 'identifier' && language.statementWords.has(tokens[from].text);
    const to = (starts[position + 1] ?? tokens.length) - 1;
    return isImport ? [{ from, to, replacement: '' }] : [];
  });
}

function dataRanges({ tokens, language, taken }) {
  const pairs = bracketPairs(tokens);
  const ranges = [];
  let resume = 0;
  for (const [index, token] of tokens.entries()) {
    const close = pairs.get(index);
    const candidate =
      index >= resume &&
      close !== undefined &&
      !taken.has(index) &&
      isOpenBracket(token) &&
      language.opensData(tokens, index);
    if (candidate && holdsOnlyData(tokens, [index, close], language)) {
      ranges.push({ from: index, to: close, replacement: '0' });
      resume = close + 1;
    }
  }
  return ranges;
}

function replacement(token, language) {
  switch (token.kind) {
    case 'identifier':
      return language.keywords.has(token.text) ? token.text : UNDERSCORE;
    case 'string':
      return `"" ${newlines(token.text)}`;
    case 'number':
      return ZERO;
    case 'comment':
      return `${newlines(token.text)} `;
    default:
      return token.text;
  }
}

function render({ text, tokens, language, ranges }) {
  const byStart = new Map(ranges.map((range) => [range.from, range]));
  let output = '';
  let cursor = 0;
  let resume = 0;
  for (const [index, token] of tokens.entries()) {
    if (index < resume) {
      continue;
    }
    const range = byStart.get(index);
    const last = range === undefined ? token : tokens[range.to];
    const covered = text.slice(token.start, last.end);
    output += text.slice(cursor, token.start);
    output +=
      range === undefined
        ? replacement(token, language)
        : `${range.replacement} ${newlines(covered)}`;
    cursor = last.end;
    resume = range === undefined ? index + 1 : range.to + 1;
  }
  return output + text.slice(cursor);
}

export function normalizeScanned(text, name) {
  const language = LANGUAGES[name];
  const tokens = scan(text, language.syntax);
  const imports = importRanges(text, tokens, language);
  const taken = new Set(
    imports.flatMap(({ from, to }) => tokens.slice(from, to + 1).map((_, offset) => from + offset)),
  );
  const data = dataRanges({ tokens, language, taken });
  const ranges = [...imports, ...data].sort((left, right) => left.from - right.from);
  return render({ text, tokens, language, ranges });
}
