export const PARENTHESES: readonly string[] = ['(', ')'];
export const BRACES: readonly string[] = ['{', '}'];

export function depthChange(
  character: string,
  left: string | undefined,
  right: string | undefined,
): number {
  if (character === left) {
    return 1;
  }
  return character === right ? -1 : 0;
}

export function balancedEnd(text: string, open: number, brackets: readonly string[]): number {
  let depth = 0;
  for (const [offset, character] of text.slice(open).split('').entries()) {
    depth += depthChange(character, brackets[0], brackets[1]);
    if (depth === 0) {
      return open + offset;
    }
  }
  return text.length;
}
