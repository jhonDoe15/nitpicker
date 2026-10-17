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
const KOTLIN_COMMENT = String.raw`//[^\n]*|/\*(?:[^*/]|\*(?!/)|/(?!\*)|/\*(?:[^*]|\*(?!/))*\*/)*(?:\*/|$)`;

function tokenizer({ comment, string, name }) {
  return new RegExp(
    `(?<comment>${comment})|(?<string>${string})|(?<identifier>${name})|` +
      String.raw`(?<number>${NUMBER})|(?<punctuation>\S)`,
    'gu',
  );
}

export const SYNTAXES = {
  python: tokenizer({ comment: '#[^\\n]*', string: PYTHON_STRING, name: NAME }),
  kotlin: tokenizer({
    comment: KOTLIN_COMMENT,
    string: KOTLIN_STRING,
    name: `\`[^\`\\n]*\`|${NAME}`,
  }),
};

const OPENERS = new Set(['(', '[', '{']);
const CLOSERS = new Set([')', ']', '}']);

export function scan(text, syntax) {
  return [...text.matchAll(syntax)].map((match) => {
    const [kind] = Object.entries(match.groups).find(([, value]) => value !== undefined);
    return { kind, start: match.index, end: match.index + match[0].length, text: match[0] };
  });
}

export function bracketPairs(tokens) {
  const pairs = new Map();
  const open = [];
  for (const [index, token] of tokens.entries()) {
    if (token.kind !== 'punctuation') {
      continue;
    }
    if (OPENERS.has(token.text)) {
      open.push(index);
    } else if (CLOSERS.has(token.text) && open.length > 0) {
      pairs.set(open.pop(), index);
    }
  }
  return pairs;
}

export function isOpenBracket(token) {
  return token.kind === 'punctuation' && OPENERS.has(token.text);
}

export function isCloseBracket(token) {
  return token.kind === 'punctuation' && CLOSERS.has(token.text);
}

export function newlines(text) {
  return '\n'.repeat(text.split('\n').length - 1);
}
