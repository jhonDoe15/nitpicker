import { statementLayout } from './layout/statement-layout.mts';
import { isOp, NEWLINE, pythonLayout } from './layout-tokens.mts';
import { scanSource } from './scan-source.mts';
import { describeLines } from './scope-moves.mts';
import { requireLanguage, sourceLanguage } from './source-languages.mts';
import type {
  DescribedLine,
  SourceLanguage,
  StatementRules,
  Token,
} from './typed/source-types.mts';

export { sourceLanguage } from './source-languages.mts';

const MAX_SOURCE_LENGTH = 1_000_000;
const OPENERS = new Set(['(', '[', '{']);
const CLOSERS = new Set([')', ']', '}']);
const OPENING_BRACE = new Set(['{']);
const SEMICOLON = new Set([';']);
const IMPORT = 'import';
const WHILE = 'while';
const CATCH = 'catch';
const FINALLY = 'finally';
const DISPLAY = 'display';
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
  WHILE,
  'with',
  'yield',
]);
const JAVASCRIPT_STATEMENTS: StatementRules = {
  restricted: new Set([...JUMPS, 'throw', 'yield', 'async']),
  statementWords: new Set([
    ...['if', 'else', 'for', WHILE, 'do', SWITCH, 'case', 'default', 'try', CATCH],
    ...[FINALLY, 'function', 'class', 'const', 'let', 'var', 'new', 'typeof', 'void'],
    ...['delete', 'in', 'instanceof', 'extends', 'implements', IMPORT, 'export', 'await'],
  ]),
  operandEnds: new Set([')', ']', '}', '++', '--']),
  continuation: new Set([
    ...['(', '[', '{', ')', ']', '}', '.', '?.', ',', '=', '+', '-', '*', '/', '%', '**'],
    ...['<', '>', '<=', '>=', '==', '!=', '===', '!==', '&&', '||', '??', '?', ':', '&'],
    ...['|', '^', '<<', '>>', '>>>', '+=', '-=', '*=', '/=', '%=', '**=', '<<=', '>>='],
    ...['>>>=', '&=', '|=', '^=', '&&=', '||=', '??=', '=>', 'in', 'instanceof', 'as'],
    ...['satisfies', 'of', 'else', CATCH, FINALLY, 'extends', 'implements'],
  ]),
  taggedTemplates: true,
  headers: new Set(['if', 'for', WHILE, 'with']),
  emptyBodies: new Set(['else', 'do']),
};
const KOTLIN_STATEMENTS: StatementRules = {
  restricted: new Set(JUMPS),
  statementWords: new Set([
    ...['if', 'else', 'for', WHILE, 'do', 'when', 'try', CATCH, FINALLY, 'fun'],
    ...['class', 'object', 'interface', 'val', 'var', IMPORT, 'package', 'in', 'is'],
    ...['as', 'typealias', 'throw'],
  ]),
  operandEnds: new Set([')', ']', '}', '++', '--', '!!', '?']),
  continuation: new Set([
    ...['.', '?.', '::', '?:', '&&', '||', 'as', ':', '=', '->', 'else', CATCH],
    ...[FINALLY, 'by', 'where', ')', ']', '}', ','],
  ]),
  taggedTemplates: false,
  headers: new Set(['if', 'for', WHILE, 'when', CATCH]),
  emptyBodies: new Set(['else', 'do']),
};
const GO_STATEMENTS: StatementRules = {
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
const STATEMENT_RULES: Readonly<Record<'javascript' | 'kotlin' | 'go', StatementRules>> = {
  javascript: JAVASCRIPT_STATEMENTS,
  kotlin: KOTLIN_STATEMENTS,
  go: GO_STATEMENTS,
};
const GO_HEADERS = new Set(['if', 'for', SWITCH]);

function laidOut(tokens: Token[], language: SourceLanguage, text: string): Token[] {
  if (language.name === 'python') {
    return pythonLayout(tokens, text.split('\n'));
  }
  if (language.name === 'java') {
    return tokens;
  }
  return statementLayout(tokens, STATEMENT_RULES[language.name]);
}

function pythonBracket(previous: Token | undefined, opener: Token): string {
  if (opener.text === '{') {
    return DISPLAY;
  }
  const afterOperand =
    (previous?.kind === 'word' && !PYTHON_KEYWORDS.has(previous.text)) ||
    previous?.kind === 'string' ||
    isOp(previous, new Set([')', ']']));
  if (opener.text === '(') {
    return afterOperand ? 'call' : 'group';
  }
  return afterOperand ? 'subscript' : DISPLAY;
}

function isFormattingComma(
  language: SourceLanguage,
  {
    previous,
    bracket,
  }: { readonly previous: Token | undefined; readonly bracket: string | undefined },
): boolean {
  if (language.name === 'python') {
    return bracket === 'call' || bracket === DISPLAY;
  }
  return previous !== undefined && !isOp(previous, OPENERS) && !isOp(previous, new Set([',']));
}

function closerAfter(code: readonly Token[], index: number): Token | undefined {
  const next = code[index + 1];
  return next?.text === NEWLINE ? code[index + 2] : next;
}

function droppedCommas(tokens: readonly Token[], language: SourceLanguage): Set<Token> {
  const code = tokens.filter((token) => token.kind !== 'comment');
  const brackets: string[] = [];
  const dropped = new Set<Token>();
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

const ARROW_PARAMETER: readonly ((token: Token | undefined) => boolean)[] = [
  (token) => isOp(token, new Set(['('])),
  (token) => token?.kind === 'word',
  (token) => isOp(token, new Set([')'])),
  (token) => isOp(token, new Set(['=>'])),
];

function arrowParameterParentheses(tokens: readonly Token[], language: SourceLanguage): Token[] {
  if (language.name !== 'javascript') {
    return [];
  }
  return tokens.flatMap((token, index) => {
    const closer = tokens[index + 2];
    return closer !== undefined &&
      ARROW_PARAMETER.every((matches, offset) => matches(tokens[index + offset]))
      ? [token, closer]
      : [];
  });
}

function closers(code: readonly Token[]): Map<number, number> {
  const open: number[] = [];
  const pairs = new Map<number, number>();
  for (const [index, token] of code.entries()) {
    if (isOp(token, OPENERS)) {
      open.push(index);
    }
    const opener = isOp(token, CLOSERS) ? open.pop() : undefined;
    if (opener !== undefined) {
      pairs.set(opener, index);
    }
  }
  return pairs;
}

function goHeaderParentheses(code: readonly Token[]): Token[] {
  const pairs = closers(code);
  return code.flatMap((token, index) => {
    const previous = code[index - 1];
    const header = previous?.kind === 'word' && GO_HEADERS.has(previous.text);
    const closer = pairs.get(index);
    const closing = closer === undefined ? undefined : code[closer];
    const after = closer === undefined ? undefined : code[closer + 1];
    return header &&
      isOp(token, new Set(['('])) &&
      closing !== undefined &&
      isOp(after, OPENING_BRACE)
      ? [token, closing]
      : [];
  });
}

function goFormatterTokens(tokens: readonly Token[], language: SourceLanguage): Token[] {
  if (language.name !== 'go') {
    return [];
  }
  const code = tokens.filter((token) => token.kind !== 'comment');
  return [...code.filter((token) => isOp(token, SEMICOLON)), ...goHeaderParentheses(code)];
}

export function formatAgnosticTokens(
  text: string,
  languageValue: unknown,
  { comments }: { readonly comments: boolean } = { comments: true },
): Token[] {
  const language = requireLanguage(languageValue);
  const tokens = laidOut(scanSource(text, language), language, text);
  const dropped = new Set([
    ...droppedCommas(tokens, language),
    ...arrowParameterParentheses(tokens, language),
    ...goFormatterTokens(tokens, language),
  ]);
  return tokens.filter((token) => !dropped.has(token) && (comments || token.kind !== 'comment'));
}

export function sourceLines(
  text: string,
  language: unknown,
): readonly (DescribedLine | undefined)[] | undefined {
  if (text.length > MAX_SOURCE_LENGTH) {
    return undefined;
  }
  const resolved = requireLanguage(language);
  return describeLines(formatAgnosticTokens(text, resolved), resolved);
}

function inlineHeader(tokens: readonly Token[]): readonly Token[] {
  const body = tokens.findIndex((token) => token.inlineBody === true);
  return body === -1 ? tokens : tokens.slice(0, body + 1);
}

export function formatAgnosticText(text: string, filePath: string | undefined): string {
  const language = filePath === undefined ? undefined : sourceLanguage(filePath);
  if (language === undefined) {
    return text.trim().replaceAll(/\s+/gu, ' ');
  }
  return inlineHeader(formatAgnosticTokens(text.trim(), language, { comments: false }))
    .map((token) => (token.text === NEWLINE ? '\n' : token.text))
    .join(' ');
}
