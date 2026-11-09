const CONTINUED =
  /^\s*(?:&&|\|\||\?:|\?\.|\.|[+\-*/%<>=![(]|(?:as|is|in|and|or|xor|to|until|downTo|step|shl|shr|ushr)\b)/;
const INFIX_NAME = /^[ \t]+[A-Za-z_]/;
const OPEN_CONTEXT = /(?:^|[({,;]|&&|\|\||(?<![=!<>])=|->|(?<![\w.@])return)$/;
const CLOSE_CONTEXT = /^[ \t]*(?:[),;}\]]|&&|\|\||->)/;
const LOOP_HEAD = /(?<![\w.])(?:for|while|if)\s*$/;
const BODY_HEAD = /(?:(?<![\w.])(?:else|do)|->)$/;

/** True when nothing after `code`'s start continues the expression that ends there. */
export function ends(code) {
  return !CONTINUED.test(code) && !INFIX_NAME.test(code);
}

/** True when the text from `start` to `end` is a whole operand of `&&`, `||`, a call or an assignment. */
export function standsFree(code, start, end) {
  const after = code.slice(end);
  return (
    OPEN_CONTEXT.test(code.slice(0, start).trimEnd()) && (CLOSE_CONTEXT.test(after) || ends(after))
  );
}

function openingIndex(code, close) {
  let depth = 0;
  const indexes = Array.from({ length: close + 1 }, (_, step) => close - step);
  for (const index of indexes) {
    depth += { ')': 1, '(': -1 }[code[index]] ?? 0;
    if (depth === 0) {
      return index;
    }
  }
  return -1;
}

/** True when the `if` at `index` is a statement of its block, not the body of a loop, `if`, `else` or branch. */
export function isBlockStatement(code, index) {
  const before = code.slice(0, index).trimEnd();
  if (BODY_HEAD.test(before)) {
    return false;
  }
  return (
    !before.endsWith(')') || !LOOP_HEAD.test(code.slice(0, openingIndex(code, before.length - 1)))
  );
}
