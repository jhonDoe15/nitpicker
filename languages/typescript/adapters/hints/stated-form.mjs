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
const OPENERS = new Map([
  ['(', ')'],
  ['[', ']'],
  ['{', '}'],
]);

function topLevelBreaks(text, separators) {
  const breaks = [];
  const closers = [];
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

function sentences(text) {
  const ends = topLevelBreaks(text, '.').filter(
    (index) => !ABBREVIATION.test(text.slice(0, index)),
  );
  return [...ends, text.length - 1].map((end, position) => {
    const start = position === 0 ? 0 : ends[position - 1] + 2;
    return { start, text: text.slice(start, end + 1) };
  });
}

function withoutTrailingProblem(sentence) {
  const cut = topLevelBreaks(sentence, ';').find(
    (index) => !IMPERATIVE.test(sentence.slice(index + 2)),
  );
  return cut === undefined ? sentence : sentence.slice(0, cut);
}

function formStart(sentence) {
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
export function statedAllowedForm(message) {
  const parts = sentences(message).filter(({ text }) => !EXCEPTION_SENTENCE.test(text));
  const first = parts.findIndex(({ text }) => formStart(text) !== undefined);
  if (first === -1) {
    return undefined;
  }
  const offset = formStart(parts[first].text);
  const lead = { start: parts[first].start + offset, text: parts[first].text.slice(offset) };
  const following = parts.slice(first + 1);
  const run = following.findIndex(({ text }) => formStart(text) !== 0);
  const kept = [lead, ...following.slice(0, run === -1 ? following.length : run)];
  const forms = kept.map(({ text }) => withoutTrailingProblem(text));
  const cutAt = forms.findIndex((form, index) => form !== kept[index].text);
  const last = cutAt === -1 ? kept.length - 1 : cutAt;
  return message.slice(lead.start, kept[last].start + forms[last].length);
}

/** `fields` with the allowed form its message states, for a rule whose messages lead with their fix. */
export function withStatedForm(ruleId, fields) {
  const stated =
    fields.allowedForm === undefined && STATED_FORM_RULES.has(ruleId)
      ? statedAllowedForm(fields.message)
      : undefined;
  return stated === undefined ? fields : { ...fields, allowedForm: stated };
}
