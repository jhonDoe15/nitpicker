import { asSentence } from '../entry.mts';

const CODE_SPAN = /(`[^`]*`)/u;
const EMPHASIS = /(?<![\p{L}\p{N}\\])(\*\*|\*|_)(?=\S)(.+?)(?<=\S)\1(?![\p{L}\p{N}])/gu;
const FIRST_SENTENCE = /^(.+?[.!?])(?:\s+|$)(?=[A-Z`([]|$)/su;

function outsideCode(text: string, transform: (part: string) => string): string {
  return text
    .split(CODE_SPAN)
    .map((part: string, index: number) => (index % 2 === 1 ? part : transform(part)))
    .join('');
}

export function flatText(text: string): string {
  return outsideCode(text.replaceAll(/\s+/gu, ' ').trim(), (part) =>
    part.replaceAll(EMPHASIS, (_: string, _marker: string, inner: string) => inner),
  );
}

export function paragraphsOf(text: string): string[] {
  return text
    .split(/\n\s*\n/u)
    .map(flatText)
    .filter((paragraph) => paragraph !== '');
}

export function splitFirstSentence(text: string): {
  first: string | undefined;
  rest: string | undefined;
} {
  const match = FIRST_SENTENCE.exec(text);
  if (match === null) {
    return { first: asSentence(text), rest: undefined };
  }
  const rest = text.slice(match[0].length).trim();
  return { first: match[1], rest: rest === '' ? undefined : rest };
}
