export function hasCommentIn(sourceCode, range) {
  return sourceCode
    .getAllComments()
    .some((comment) => comment.range[0] < range[1] && range[0] < comment.range[1]);
}

export function replacing(range, text) {
  return (fixer) => fixer.replaceTextRange(range, text);
}

export function inserting(index, text) {
  return replacing([index, index], text);
}

export function removalRange(text, range) {
  const lineStart = text.lastIndexOf('\n', range[0] - 1) + 1;
  const newline = text.indexOf('\n', range[1]);
  const lineEnd = newline === -1 ? text.length : newline;
  const aloneOnLine =
    /^\s*$/u.test(text.slice(lineStart, range[0])) && /^\s*$/u.test(text.slice(range[1], lineEnd));
  if (aloneOnLine) {
    return [lineStart, newline === -1 ? text.length : newline + 1];
  }
  return range;
}

export function removingStatement(sourceCode, statement) {
  if (hasCommentIn(sourceCode, statement.range)) {
    return undefined;
  }
  return replacing(removalRange(sourceCode.text, statement.range), '');
}
