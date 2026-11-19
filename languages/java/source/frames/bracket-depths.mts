export const GENERIC_DEPTH: Readonly<Record<string, number>> = { '<': 1, '>': -1 };
export const PAREN_DEPTH: Readonly<Record<string, number>> = { '(': 1, ')': -1 };

export function closingByDepth(
  text: string,
  open: number,
  depths: Readonly<Record<string, number | undefined>>,
): number {
  let depth = 0;
  for (const { index, 0: character } of text.slice(open).matchAll(/./gsu)) {
    depth += depths[character] ?? 0;
    if (depth === 0) {
      return open + index;
    }
  }
  return -1;
}

export function closingOrEnd(
  text: string,
  open: number,
  depths: Readonly<Record<string, number | undefined>>,
): number {
  const close = closingByDepth(text, open, depths);
  return close < 0 ? text.length : close;
}

type TopLevelBrackets = {
  readonly openers: string;
  readonly closers: string;
  readonly arrows?: true;
};

function closesAt(text: string, index: number, { closers, arrows }: TopLevelBrackets): boolean {
  const character = text.charAt(index);
  return (
    closers.includes(character) &&
    !(arrows === true && character === '>' && text.charAt(index - 1) === '-')
  );
}

export function topLevelParts(text: string, brackets: TopLevelBrackets): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (const { index, 0: character } of text.matchAll(/./gsu)) {
    if (brackets.openers.includes(character)) {
      depth += 1;
    } else if (closesAt(text, index, brackets)) {
      depth = Math.max(0, depth - 1);
    } else if (character === ',' && depth === 0) {
      parts.push(text.slice(start, index));
      start = index + 1;
    }
  }
  return [...parts, text.slice(start)].map((part) => part.trim()).filter((part) => part !== '');
}
