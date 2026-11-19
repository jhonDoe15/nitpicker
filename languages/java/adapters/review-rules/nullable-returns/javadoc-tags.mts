const JAVADOC_OPEN = /\/\*\*/gu;
const JAVADOC_CLOSE = '*/';
const ANNOTATIONS = String.raw`\s*(?:@\w+(?:\([^)]*\))?\s*)*`;
const DECLARATION_HEAD = String.raw`[\w.<>[\],?\s]*\(`;
const WORD = /^\w+$/u;
const RETURN_TAG = /@return\b/u;
const TAG_START = /^@\w/u;
const NEGATIONS = [
  'never',
  'always',
  'not',
  'non',
  'neither',
  'nor',
  'no',
  'without',
  'instead of',
  'rather than',
  'cannot',
  "can't",
  'default implementation',
];
const NEGATED = new RegExp(String.raw`\b(?:${NEGATIONS.join('|')})\b[^.;]{1,24}\bnull`, 'iu');
const NULL_IN_NULL_OUT =
  /\bnull\s+(?:if|when|for)\s+(?:the\s+)?[\w\s]{0,24}?\b(?:is|are|was)\s+(?:\{@code\s+|<code>)?null\b/iu;
const MAY_BE_NULL = new RegExp(
  [
    String.raw`\bnull\s+(?:if|when|otherwise|unless|in case|on|for|where|as)\b`,
    String.raw`\bor\s+(?:\{@code\s+|<code>)?null\b`,
    String.raw`\b(?:may|can|might|will|could)\s+(?:also\s+)?(?:be|return)\s+(?:\{@code\s+|<code>)?null\b`,
    String.raw`^\s*(?:\{@code\s+|<code>)?null\b`,
    String.raw`\bnull\s+(?:is returned|means)\b`,
  ].join('|'),
  'iu',
);
const COMMENT_START = '/**'.length;

type Javadoc = { readonly comment: string; readonly name: string; readonly nameAt: number };

function declaredName(text: string, start: number): { name: string; nameAt: number } | undefined {
  const annotations = new RegExp(ANNOTATIONS, 'uy');
  annotations.lastIndex = start;
  annotations.exec(text);
  const declaration = new RegExp(DECLARATION_HEAD, 'uy');
  declaration.lastIndex = annotations.lastIndex;
  const head = declaration.exec(text);
  const words = (head?.[0] ?? '').slice(0, -1).trim().split(/\s+/u);
  const name = words.at(-1) ?? '';
  if (head === null || words.length < 2 || !WORD.test(name)) {
    return undefined;
  }
  return { name, nameAt: head.index + head[0].slice(0, -1).trimEnd().length - name.length };
}

function javadocs(text: string): Javadoc[] {
  const found: Javadoc[] = [];
  for (const open of text.matchAll(JAVADOC_OPEN)) {
    const close = text.indexOf(JAVADOC_CLOSE, open.index + COMMENT_START);
    const declared = close < 0 ? undefined : declaredName(text, close + JAVADOC_CLOSE.length);
    if (declared !== undefined && open.index >= (found.at(-1)?.nameAt ?? 0)) {
      found.push({
        comment: text.slice(open.index + COMMENT_START, close),
        ...declared,
      });
    }
  }
  return found;
}

function startsTag(rest: string): boolean {
  const line = rest.trimStart();
  return TAG_START.test((line.startsWith('*') ? line.slice(1) : line).trimStart());
}

function returnTag(comment: string): string {
  const at = RETURN_TAG.exec(comment);
  if (at === null) {
    return '';
  }
  const rest = comment.slice(at.index + at[0].length);
  const ends = [...rest.matchAll(/\n/gu)].map(({ index }) => index);
  const end = ends.find((index) => startsTag(rest.slice(index + 1))) ?? rest.length;
  return rest.slice(0, end);
}

export function documentedNullable(text: string): Map<string, string> {
  const found = new Map<string, string>();
  const lines = { line: 1, offset: 0 };
  for (const { comment, name, nameAt } of javadocs(text)) {
    lines.line += text.slice(lines.offset, nameAt).split('\n').length - 1;
    lines.offset = nameAt;
    const tag = returnTag(comment.replaceAll(/\n\s*\*/gu, '\n')).replaceAll(/\s+/gu, ' ');
    if (!NEGATED.test(tag) && !NULL_IN_NULL_OUT.test(tag) && MAY_BE_NULL.test(tag)) {
      found.set(`${name}:${String(lines.line)}`, tag);
    }
  }
  return found;
}
