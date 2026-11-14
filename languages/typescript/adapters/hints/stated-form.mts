import type { HintedFields } from './eslint-routes.mts';

const IMPERATIVE_VERBS = [
  'add',
  'assert',
  'await',
  'build',
  'call',
  'check',
  'construct',
  'declare',
  'delete',
  'do',
  'fix',
  'fold',
  'give',
  'import',
  'iterate',
  'keep',
  'list',
  'make',
  'mark',
  'merge',
  'move',
  'name',
  'narrow',
  'pass',
  'put',
  'read',
  'remove',
  'replace',
  'return',
  'rewrite',
  'split',
  'take',
  'test',
  'throw',
  'transform',
  'type',
  'use',
  'wrap',
  'write',
];
const IMPERATIVE = new RegExp(`^(?:${IMPERATIVE_VERBS.join('|')})\\b(?! not\\b)`, 'iu');
const CAPITAL = /^\p{Lu}/u;
const STATED_FORM_RULES = new Set([
  'nitpicker/no-comments',
  'nitpicker/no-magic-numbers',
  'nitpicker/no-production-console',
  'no-restricted-syntax',
]);
const EXCEPTION_SENTENCE = /^An exception fits only\b/u;
const ABBREVIATION = /\b(?:e\.g|i\.e)$/u;
type Sentence = { readonly start: number; readonly text: string };

const OPENERS = new Map([
  ['(', ')'],
  ['[', ']'],
  ['{', '}'],
]);

function topLevelBreaks(text: string, separators: string): number[] {
  const breaks: number[] = [];
  const closers: (string | undefined)[] = [];
  let quoted = false;
  for (const [index, character] of text.split('').entries()) {
    if (character === '`') {
      quoted = !quoted;
    } else if (!quoted && OPENERS.has(character)) {
      closers.push(OPENERS.get(character));
    } else if (!quoted && character === closers.at(-1)) {
      closers.pop();
    } else if (
      !quoted &&
      closers.length === 0 &&
      separators.includes(character) &&
      text[index + 1] === ' '
    ) {
      breaks.push(index);
    }
  }
  return breaks;
}

function sentences(text: string): Sentence[] {
  const ends = topLevelBreaks(text, '.').filter(
    (index) => !ABBREVIATION.test(text.slice(0, index)),
  );
  return [...ends, text.length - 1].map((end, position) => {
    const start = position === 0 ? 0 : (ends[position - 1] ?? 0) + 2;
    return { start, text: text.slice(start, end + 1) };
  });
}

function withoutTrailingProblem(sentence: string): string {
  const cut = topLevelBreaks(sentence, ';').find(
    (index) => !IMPERATIVE.test(sentence.slice(index + 2)),
  );
  return cut === undefined ? sentence : sentence.slice(0, cut);
}

function formStart(sentence: string): number | undefined {
  if (CAPITAL.test(sentence) && IMPERATIVE.test(sentence)) {
    return 0;
  }
  const clause = topLevelBreaks(sentence, ':;').find((index) =>
    IMPERATIVE.test(sentence.slice(index + 2)),
  );
  return clause === undefined ? undefined : clause + 2;
}

/**
 * The allowed form a lint message states in its own words: the first imperative sentence or clause
 * (`Use ...`, `...: transform with ...`), up to a clause that only restates the problem, followed
 * by the imperative sentences right after it. Undefined when the message names no form.
 */
export function statedAllowedForm(message: string): string | undefined {
  const parts = sentences(message).filter(({ text }) => !EXCEPTION_SENTENCE.test(text));
  const first = parts.findIndex(({ text }) => formStart(text) !== undefined);
  const firstPart = parts[first];
  const offset = firstPart === undefined ? undefined : formStart(firstPart.text);
  if (firstPart === undefined || offset === undefined) {
    return undefined;
  }
  const lead = { start: firstPart.start + offset, text: firstPart.text.slice(offset) };
  const following = parts.slice(first + 1);
  const run = following.findIndex(({ text }) => formStart(text) !== 0);
  const kept = [lead, ...following.slice(0, run === -1 ? following.length : run)].map((part) => ({
    ...part,
    form: withoutTrailingProblem(part.text),
  }));
  const cut = kept.find(({ form, text }) => form !== text) ?? kept.at(-1);
  return cut === undefined ? undefined : message.slice(lead.start, cut.start + cut.form.length);
}

/** `fields` with the allowed form its message states, for a rule whose messages lead with their fix. */
export function withStatedForm(
  ruleId: string,
  fields: { readonly message: string; readonly allowedForm?: string },
): { readonly message: string; readonly allowedForm?: string } {
  const stated =
    fields.allowedForm === undefined && STATED_FORM_RULES.has(ruleId)
      ? statedAllowedForm(fields.message)
      : undefined;
  return stated === undefined ? fields : { ...fields, allowedForm: stated };
}

export function hinted(text: string, hint: string): HintedFields {
  return { message: `${text}${hint}`, allowedForm: hint.replace(/^[.\s]+/u, '') };
}

export function directive(message: string): HintedFields {
  return { message, allowedForm: message };
}
