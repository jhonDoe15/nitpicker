const COMMENT_OR_STRING =
  /\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$)|"(?:\\.|[^"\\\n])*"?|'(?:\\.|[^'\\\n])*'?|`(?:\\.|[^`\\])*`?/gu;

function kept(part) {
  if (part.startsWith('//')) {
    return '';
  }
  return part.startsWith('/*') ? ' ' : part;
}

export function withoutComments(text) {
  return text.replaceAll(COMMENT_OR_STRING, kept);
}
