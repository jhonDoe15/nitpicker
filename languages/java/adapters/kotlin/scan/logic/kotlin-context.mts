const PAREN_STEPS: Readonly<Record<string, number>> = { ')': 1, '(': -1 };
const CONTINUED =
  /^\s*(?:&&|\|\||\?:|\?\.|\.|[+\-*/%<>=![(]|(?:as|is|in|and|or|xor|to|until|downTo|step|shl|shr|ushr)\b)/;
const INFIX_NAME = /^[ \t]+[A-Za-z_]/;
const OPEN_CONTEXT = /(?:^|[({,;]|&&|\|\||(?<![=!<>])=|->|(?<![\w.@])return)$/;
const CLOSE_CONTEXT = /^[ \t]*(?:[),;}\]]|&&|\|\||->)/;
const LOOP_HEAD = /(?<![\w.])(?:for|while|if)\s*$/;
const BODY_HEAD = /(?:(?<![\w.])(?:else|do)|->)$/;

export function ends(code: string): boolean {
  return !(CONTINUED.test(code) || INFIX_NAME.test(code));
}

export function standsFree(code: string, start: number, end: number): boolean {
  const after = code.slice(end);
  return (
    OPEN_CONTEXT.test(code.slice(0, start).trimEnd()) && (CLOSE_CONTEXT.test(after) || ends(after))
  );
}

function openingIndex(code: string, close: number): number {
  let depth = 0;
  const indexes = Array.from({ length: close + 1 }, (_, step) => close - step);
  for (const index of indexes) {
    depth += PAREN_STEPS[code[index] ?? ''] ?? 0;
    if (depth === 0) {
      return index;
    }
  }
  return -1;
}

export function isBlockStatement(code: string, index: number): boolean {
  const before = code.slice(0, index).trimEnd();
  if (BODY_HEAD.test(before)) {
    return false;
  }
  return !(
    before.endsWith(')') && LOOP_HEAD.test(code.slice(0, openingIndex(code, before.length - 1)))
  );
}
