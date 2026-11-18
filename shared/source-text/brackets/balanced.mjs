export const PARENTHESES = ['(', ')'];
export const BRACES = ['{', '}'];

export function depthChange(character, left, right) {
  if (character === left) {
    return 1;
  }
  return character === right ? -1 : 0;
}

export function balancedEnd(text, open, brackets) {
  let depth = 0;
  for (const [offset, character] of text.slice(open).split('').entries()) {
    depth += depthChange(character, brackets[0], brackets[1]);
    if (depth === 0) {
      return open + offset;
    }
  }
  return text.length;
}
