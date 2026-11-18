const ESCAPES: Readonly<Record<string, string>> = {
  '\\': '\\\\',
  '\n': '\\n',
  '\r': '\\r',
  '\t': '\\t',
  '\b': '\\b',
  '\f': '\\f',
  '\v': '\\v',
  '\0': '\\x00',
  '\u2028': '\\u2028',
  '\u2029': '\\u2029',
};

const SPECIAL = /[\\\n\r\t\b\f\v\0\u2028\u2029]|\p{Cc}|\p{Surrogate}/gu;

function escaped(character: string): string {
  const known = ESCAPES[character];
  if (known !== undefined) {
    return known;
  }
  const code = character.codePointAt(0) ?? 0;
  return `\\u${code.toString(16).padStart(4, '0')}`;
}

export function quoted(value: string, quote: string): string {
  const body = value.replaceAll(SPECIAL, escaped).replaceAll(quote, `\\${quote}`);
  return quote === '`'
    ? `${quote}${body.replaceAll('${', '\\${')}${quote}`
    : `${quote}${body}${quote}`;
}

const CONTINUATION = /\\(?:\r\n|[\n\r\u2028\u2029])/u;

export function hasLineContinuation(raw: string): boolean {
  return CONTINUATION.test(raw);
}
