const NUMBER = String.raw`\.?\d(?:\w|(?<=[eE])[+-]|\.(?!\.))*`;
const NAME = String.raw`[\p{L}_][\p{L}\p{N}_]*`;
const PYTHON_STRING =
  String.raw`(?:[rRbBuUfF]{1,2})?(?:` +
  String.raw`'''(?:\\[\s\S]|[^\\])*?(?:'''|$)|"""(?:\\[\s\S]|[^\\])*?(?:"""|$)|` +
  String.raw`'(?:\\[\s\S]|[^'\\\n])*'?|"(?:\\[\s\S]|[^"\\\n])*"?)`;
const KOTLIN_SIMPLE_STRING = String.raw`"(?:\\.|[^"\\\n])*"`;
const KOTLIN_TEMPLATE_BLOCK = String.raw`\{(?:[^{}"]|${KOTLIN_SIMPLE_STRING})*\}`;
const KOTLIN_TEMPLATE = String.raw`\$\{(?:[^{}"]|${KOTLIN_SIMPLE_STRING}|${KOTLIN_TEMPLATE_BLOCK})*\}`;
const KOTLIN_STRING =
  String.raw`"""[\s\S]*?(?:"""|$)|"(?:\\[\s\S]|${KOTLIN_TEMPLATE}|[^"\\$\n]|\$)*"?|` +
  String.raw`'(?:\\.|[^'\\\n])*'?`;
const JAVA_STRING = String.raw`"""[\s\S]*?(?:"""|$)|"(?:\\.|[^"\\\n])*"?|'(?:\\.|[^'\\\n])*'?`;
const JAVA_COMMENT = String.raw`//[^\n]*|/\*[\s\S]*?(?:\*/|$)`;
const GO_STRING = String.raw`\x60[^\x60]*\x60?|"(?:\\.|[^"\\\n])*"?|'(?:\\.|[^'\\\n])*'?`;
const KOTLIN_COMMENT = String.raw`//[^\n]*|/\*(?:[^*/]|\*(?!/)|/(?!\*)|/\*(?:[^*]|\*(?!/))*\*/)*(?:\*/|$)`;

function tokenizer({
  comment,
  string,
  name,
}: {
  readonly comment: string;
  readonly string: string;
  readonly name: string;
}): RegExp {
  return new RegExp(
    `(?<comment>${comment})|(?<string>${string})|(?<identifier>${name})|` +
      String.raw`(?<number>${NUMBER})|(?<punctuation>\S)`,
    'gu',
  );
}

export type ScannedSyntax = 'python' | 'kotlin' | 'java' | 'go';

export type Token = {
  readonly kind: string;
  readonly start: number;
  readonly end: number;
  readonly text: string;
};

export const SYNTAXES: Readonly<Record<ScannedSyntax, RegExp>> = {
  python: tokenizer({ comment: '#[^\\n]*', string: PYTHON_STRING, name: NAME }),
  kotlin: tokenizer({
    comment: KOTLIN_COMMENT,
    string: KOTLIN_STRING,
    name: `\`[^\`\\n]*\`|${NAME}`,
  }),
  java: tokenizer({ comment: JAVA_COMMENT, string: JAVA_STRING, name: NAME }),
  go: tokenizer({ comment: JAVA_COMMENT, string: GO_STRING, name: NAME }),
};

const OPENERS = new Set(['(', '[', '{']);
const CLOSERS = new Set([')', ']', '}']);

export function scan(text: string, syntax: RegExp): Token[] {
  return [...text.matchAll(syntax)].map((match) => {
    const groups: Readonly<Record<string, string | undefined>> = match.groups ?? {};
    const found = Object.entries(groups).find(([, value]) => value !== undefined);
    if (found === undefined) {
      throw new TypeError('A scanned token matched none of its groups');
    }
    return {
      kind: found[0],
      start: match.index,
      end: match.index + match[0].length,
      text: match[0],
    };
  });
}

export function tokenAt(tokens: readonly Token[], index: number): Token {
  const token = tokens[index];
  if (token === undefined) {
    throw new RangeError(`There is no token at ${String(index)}`);
  }
  return token;
}

function pairClosing(pairs: Map<number, number>, open: number[], index: number): void {
  const opener = open.pop();
  if (opener !== undefined) {
    pairs.set(opener, index);
  }
}

export function bracketPairs(tokens: readonly Token[]): Map<number, number> {
  const pairs = new Map<number, number>();
  const open: number[] = [];
  for (const [index, token] of tokens.entries()) {
    if (token.kind !== 'punctuation') {
      continue;
    }
    if (OPENERS.has(token.text)) {
      open.push(index);
    } else if (CLOSERS.has(token.text)) {
      pairClosing(pairs, open, index);
    }
  }
  return pairs;
}

export function isOpenBracket(token: Token): boolean {
  return token.kind === 'punctuation' && OPENERS.has(token.text);
}

export function isCloseBracket(token: Token): boolean {
  return token.kind === 'punctuation' && CLOSERS.has(token.text);
}

export function newlines(text: string): string {
  return '\n'.repeat(text.split('\n').length - 1);
}
