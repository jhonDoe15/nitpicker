import { NEWLINE, pythonLayout, statementLayout } from './layout-tokens.mjs';
import { scanSource } from './scan-source.mjs';
import { describeLines } from './scope-moves.mjs';
import { sourceLanguage } from './source-languages.mjs';

export { sourceLanguage } from './source-languages.mjs';

const MAX_SOURCE_LENGTH = 1_000_000;
const OPENERS = new Set(['(', '[', '{']);
const CLOSERS = new Set([')', ']', '}']);
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
  'import',
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
  restricted: new Set(['return', 'break', 'continue', 'throw', 'yield', 'async']),
  statementWords: new Set([
    ...['if', 'else', 'for', 'while', 'do', 'switch', 'case', 'default', 'try', 'catch'],
    ...['finally', 'function', 'class', 'const', 'let', 'var', 'new', 'typeof', 'void'],
    ...['delete', 'in', 'instanceof', 'extends', 'implements', 'import', 'export', 'await'],
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
  restricted: new Set(['return', 'break', 'continue']),
  statementWords: new Set([
    ...['if', 'else', 'for', 'while', 'do', 'when', 'try', 'catch', 'finally', 'fun'],
    ...['class', 'object', 'interface', 'val', 'var', 'import', 'package', 'in', 'is'],
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

function laidOut(tokens, language, text) {
  if (language.name === 'python') {
    return pythonLayout(tokens, text.split('\n'));
  }
  if (language.name === 'java') {
    return tokens;
  }
  return statementLayout(
    tokens,
    language.name === 'kotlin' ? KOTLIN_STATEMENTS : JAVASCRIPT_STATEMENTS,
  );
}

function isOp(token, texts) {
  return token?.kind === 'op' && texts.has(token.text);
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
    const trailing = isOp(token, new Set([','])) && isOp(code[index + 1], CLOSERS);
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

export function formatAgnosticTokens(text, language, { comments = true } = {}) {
  const tokens = laidOut(scanSource(text, language), language, text);
  const dropped = new Set([
    ...droppedCommas(tokens, language),
    ...arrowParameterParentheses(tokens, language),
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
