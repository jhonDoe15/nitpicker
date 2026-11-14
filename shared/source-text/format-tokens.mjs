import { isOp, NEWLINE, pythonLayout, statementLayout } from './layout-tokens.mjs';
import { scanSource } from './scan-source.mjs';
import { describeLines } from './scope-moves.mjs';
import { sourceLanguage } from './source-languages.mjs';

export { sourceLanguage } from './source-languages.mjs';

const MAX_SOURCE_LENGTH = 1_000_000;
const OPENERS = new Set(['(', '[', '{']);
const CLOSERS = new Set([')', ']', '}']);
const OPENING_BRACE = new Set(['{']);
const SEMICOLON = new Set([';']);
const IMPORT = 'import';
const SWITCH = 'switch';
const JUMPS = ['return', 'break', 'continue'];
const PYTHON_KEYWORDS = new Set([
  'and',
  'as',
  'assert',
  'async',
  'await',
  'case',
  'del',
  'elif',
  'else',
  'except',
  'for',
  'from',
  'global',
  'if',
  IMPORT,
  'in',
  'is',
  'lambda',
  'match',
  'nonlocal',
  'not',
  'or',
  'raise',
  'return',
  'while',
  'with',
  'yield',
]);
const JAVASCRIPT_STATEMENTS = {
  restricted: new Set([...JUMPS, 'throw', 'yield', 'async']),
  statementWords: new Set([
    ...['if', 'else', 'for', 'while', 'do', SWITCH, 'case', 'default', 'try', 'catch'],
    ...['finally', 'function', 'class', 'const', 'let', 'var', 'new', 'typeof', 'void'],
    ...['delete', 'in', 'instanceof', 'extends', 'implements', IMPORT, 'export', 'await'],
  ]),
  operandEnds: new Set([')', ']', '}', '++', '--']),
  continuation: new Set([
    ...['(', '[', '{', ')', ']', '}', '.', '?.', ',', '=', '+', '-', '*', '/', '%', '**'],
    ...['<', '>', '<=', '>=', '==', '!=', '===', '!==', '&&', '||', '??', '?', ':', '&'],
    ...['|', '^', '<<', '>>', '>>>', '+=', '-=', '*=', '/=', '%=', '**=', '<<=', '>>='],
    ...['>>>=', '&=', '|=', '^=', '&&=', '||=', '??=', '=>', 'in', 'instanceof', 'as'],
    ...['satisfies', 'of', 'else', 'catch', 'finally', 'extends', 'implements'],
  ]),
  taggedTemplates: true,
  headers: new Set(['if', 'for', 'while', 'with']),
  emptyBodies: new Set(['else', 'do']),
};
const KOTLIN_STATEMENTS = {
  restricted: new Set(JUMPS),
  statementWords: new Set([
    ...['if', 'else', 'for', 'while', 'do', 'when', 'try', 'catch', 'finally', 'fun'],
    ...['class', 'object', 'interface', 'val', 'var', IMPORT, 'package', 'in', 'is'],
    ...['as', 'typealias', 'throw'],
  ]),
  operandEnds: new Set([')', ']', '}', '++', '--', '!!', '?']),
  continuation: new Set([
    ...['.', '?.', '::', '?:', '&&', '||', 'as', ':', '=', '->', 'else', 'catch'],
    ...['finally', 'by', 'where', ')', ']', '}', ','],
  ]),
  taggedTemplates: false,
  headers: new Set(['if', 'for', 'while', 'when', 'catch']),
  emptyBodies: new Set(['else', 'do']),
};
const GO_STATEMENTS = {
  restricted: new Set([...JUMPS, 'fallthrough']),
  statementWords: new Set([
    ...['case', 'chan', 'const', 'default', 'defer', 'else', 'for', 'func', 'go', 'goto'],
    ...['if', IMPORT, 'interface', 'map', 'package', 'range', 'select', 'struct', SWITCH],
    ...['type', 'var'],
  ]),
  operandEnds: new Set([')', ']', '}', '++', '--']),
  continuation: new Set(),
  taggedTemplates: false,
  headers: new Set(),
  emptyBodies: new Set(),
};
const STATEMENT_RULES = {
  javascript: JAVASCRIPT_STATEMENTS,
  kotlin: KOTLIN_STATEMENTS,
  go: GO_STATEMENTS,
};
const GO_HEADERS = new Set(['if', 'for', SWITCH]);

function laidOut(tokens, language, text) {
  if (language.name === 'python') {
    return pythonLayout(tokens, text.split('\n'));
  }
  if (language.name === 'java') {
    return tokens;
  }
  return statementLayout(tokens, STATEMENT_RULES[language.name]);
}

function pythonBracket(previous, opener) {
  if (opener.text === '{') {
    return 'display';
  }
  const afterOperand =
    (previous?.kind === 'word' && !PYTHON_KEYWORDS.has(previous.text)) ||
    previous?.kind === 'string' ||
    isOp(previous, new Set([')', ']']));
  if (opener.text === '(') {
    return afterOperand ? 'call' : 'group';
  }
  return afterOperand ? 'subscript' : 'display';
}

function isFormattingComma(language, { previous, bracket }) {
  if (language.name === 'python') {
    return bracket === 'call' || bracket === 'display';
  }
  return previous !== undefined && !isOp(previous, OPENERS) && !isOp(previous, new Set([',']));
}

function closerAfter(code, index) {
  const next = code[index + 1];
  return next?.text === NEWLINE ? code[index + 2] : next;
}

function droppedCommas(tokens, language) {
  const code = tokens.filter((token) => token.kind !== 'comment');
  const brackets = [];
  const dropped = new Set();
  for (const [index, token] of code.entries()) {
    const previous = code[index - 1];
    if (isOp(token, OPENERS)) {
      brackets.push(pythonBracket(previous, token));
    }
    if (isOp(token, CLOSERS)) {
      brackets.pop();
    }
    const trailing = isOp(token, new Set([','])) && isOp(closerAfter(code, index), CLOSERS);
    if (trailing && isFormattingComma(language, { previous, bracket: brackets.at(-1) })) {
      dropped.add(token);
    }
  }
  return dropped;
}

const ARROW_PARAMETER = [
  (token) => isOp(token, new Set(['('])),
  (token) => token?.kind === 'word',
  (token) => isOp(token, new Set([')'])),
  (token) => isOp(token, new Set(['=>'])),
];

function arrowParameterParentheses(tokens, language) {
  if (language.name !== 'javascript') {
    return [];
  }
  return tokens.flatMap((_, index) =>
    ARROW_PARAMETER.every((matches, offset) => matches(tokens[index + offset]))
      ? [tokens[index], tokens[index + 2]]
      : [],
  );
}

function closers(code) {
  const open = [];
  const pairs = new Map();
  for (const [index, token] of code.entries()) {
    if (isOp(token, OPENERS)) {
      open.push(index);
    }
    if (isOp(token, CLOSERS) && open.length > 0) {
      pairs.set(open.pop(), index);
    }
  }
  return pairs;
}

function goHeaderParentheses(code) {
  const pairs = closers(code);
  return code.flatMap((token, index) => {
    const previous = code[index - 1];
    const header = previous?.kind === 'word' && GO_HEADERS.has(previous.text);
    const closer = pairs.get(index);
    return header && isOp(token, new Set(['('])) && isOp(code[closer + 1], OPENING_BRACE)
      ? [token, code[closer]]
      : [];
  });
}

function goFormatterTokens(tokens, language) {
  if (language.name !== 'go') {
    return [];
  }
  const code = tokens.filter((token) => token.kind !== 'comment');
  return [...code.filter((token) => isOp(token, SEMICOLON)), ...goHeaderParentheses(code)];
}

export function formatAgnosticTokens(text, language, { comments = true } = {}) {
  const tokens = laidOut(scanSource(text, language), language, text);
  const dropped = new Set([
    ...droppedCommas(tokens, language),
    ...arrowParameterParentheses(tokens, language),
    ...goFormatterTokens(tokens, language),
  ]);
  return tokens.filter((token) => !dropped.has(token) && (comments || token.kind !== 'comment'));
}

export function sourceLines(text, language) {
  return text.length > MAX_SOURCE_LENGTH
    ? undefined
    : describeLines(formatAgnosticTokens(text, language), language);
}

function inlineHeader(tokens) {
  const body = tokens.findIndex((token) => token.inlineBody === true);
  return body === -1 ? tokens : tokens.slice(0, body + 1);
}

export function formatAgnosticText(text, filePath) {
  const language = sourceLanguage(filePath);
  if (language === undefined) {
    return text.trim().replaceAll(/\s+/gu, ' ');
  }
  return inlineHeader(formatAgnosticTokens(text.trim(), language, { comments: false }))
    .map((token) => (token.text === NEWLINE ? '\n' : token.text))
    .join(' ');
}
