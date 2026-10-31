const CODE_SPAN = /(`[^`]*`)/u;
const EMPHASIS = /(?<![\p{L}\p{N}\\])(\*\*|\*|_)(?=\S)(.+?)(?<=\S)\1(?![\p{L}\p{N}])/gu;
const SENTENCE_END = /[.!?]$/u;
const FIRST_SENTENCE = /^(.+?[.!?])(?:\s+|$)(?=[A-Z`([]|$)/su;

function outsideCode(text, transform) {
  return text
    .split(CODE_SPAN)
    .map((part, index) => (index % 2 === 1 ? part : transform(part)))
    .join('');
}

/** `text` on one line, without Markdown emphasis markers outside code spans. */
export function flatText(text) {
  return outsideCode(text.replaceAll(/\s+/gu, ' ').trim(), (part) =>
    part.replaceAll(EMPHASIS, '$2'),
  );
}

/** The paragraphs of a Markdown text, each on one line. */
export function paragraphsOf(text) {
  return text
    .split(/\n\s*\n/u)
    .map(flatText)
    .filter((paragraph) => paragraph !== '');
}

/** `text` with a capital first letter and a full stop at the end. */
export function asSentence(text) {
  const trimmed = text.trim();
  const capitalized = `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}`;
  return SENTENCE_END.test(capitalized) ? capitalized : `${capitalized}.`;
}

/** The first sentence of a one-line text, and the rest, if any. */
export function splitFirstSentence(text) {
  const match = FIRST_SENTENCE.exec(text);
  if (match === null) {
    return { first: asSentence(text), rest: undefined };
  }
  const rest = text.slice(match[0].length).trim();
  return { first: match[1], rest: rest === '' ? undefined : rest };
}
