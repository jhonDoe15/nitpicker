import { enclosingOpen } from '../kotlin-source.mjs';

const TYPE_KEYWORD = /\b(?:class|object|interface)\b/;
const FUNCTION_KEYWORD = /(?<![\w.])fun\b/;
const HIDING_MODIFIER = /\b(?:private|internal|protected)\b/;
const HEADER_START = /[;{}]/g;

function headerBefore(code, open) {
  const starts = [...code.slice(0, open).matchAll(HEADER_START)];
  const start = starts.length === 0 ? 0 : starts.at(-1).index + 1;
  return code.slice(start, open);
}

function hidesFunctions(header) {
  const type = TYPE_KEYWORD.exec(header);
  if (type !== null) {
    return HIDING_MODIFIER.test(header.slice(0, type.index));
  }
  return FUNCTION_KEYWORD.test(header);
}

export function isReachableFromOutside(code, offset) {
  let open = enclosingOpen(code, offset);
  while (open !== -1) {
    if (hidesFunctions(headerBefore(code, open))) {
      return false;
    }
    open = enclosingOpen(code, open);
  }
  return true;
}
