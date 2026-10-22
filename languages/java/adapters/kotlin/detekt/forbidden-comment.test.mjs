import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { listEntriesOf, MERGED_LISTS } from './detekt-lists.mjs';

const TEXT = readFileSync(
  path.resolve(import.meta.dirname, '../../../detekt/nitpicker-detekt.yml'),
  'utf8',
);
const RULE = parse(TEXT).style.ForbiddenComment;
const COMMENTS = listEntriesOf(
  TEXT,
  MERGED_LISTS.find(({ rule }) => rule === 'ForbiddenComment'),
);

function javaRegex(pattern) {
  return new RegExp(pattern.replaceAll('(?m)', '').replaceAll('(?-i)', ''), 'm');
}

const FORBIDDEN = javaRegex(COMMENTS[0].value);
const ALLOWED = javaRegex(RULE.allowedPatterns);

function commentText(comment) {
  return comment
    .replace(/^\/\/\s?/, '')
    .replace(/^\/\*+/, '')
    .replace(/\*+\/$/, '');
}

function reported(comment) {
  const text = commentText(comment);
  return FORBIDDEN.test(text) && !ALLOWED.test(text);
}

describe('the TODO comment rule', () => {
  it.each([
    ['a bare TODO', '// TODO fix this'],
    ['a TODO with a colon and no reference', '// TODO: later'],
    ['a FIXME', '// FIXME broken'],
    ['an XXX', '// XXX revisit'],
    ['a HACK', '// HACK works for now'],
    ['a STOPSHIP', '// STOPSHIP remove'],
    ['a TODO in a block comment line', '/*\n * TODO split this\n */'],
    ['a TODO in KDoc', '/**\n * TODO document\n */'],
    ['a TODO with an empty reference', '// TODO(): later'],
    ['a TODO that names a standard, not an issue', '// TODO(RFC-7231): follow it'],
    ['a TODO with a colon after other words', '// remove this: TODO: later'],
  ])('reports %s', (_name, comment) => {
    expect(reported(comment)).toBe(true);
  });

  it.each([
    ['a TODO with a hash reference in parentheses', '// TODO(#123): split this'],
    ['a TODO with a hash reference after a colon', '// TODO: #123 split this'],
    ['a TODO with a hash reference after a space', '// TODO #123 split this'],
    ['a TODO with a ticket key in parentheses', '// TODO(PROJ-123): split this'],
    ['a TODO with a ticket key after a space', '// TODO PROJ-123 split this'],
    ['a FIXME with a link', '// FIXME https://example.com/issues/9 broken'],
    ['a TODO with a key that has digits', '// TODO(AB2-45): later'],
    ['a todo in lower case, which is prose', '// todo lists are kept elsewhere'],
    ['a word that contains the marker', '// TODOS are tracked in the board'],
    ['a marker in a path', '// see docs/TODO.md for the plan'],
    ['a marker in a name', '// the TODO-list parser'],
    ['a mention without a colon in the middle of a sentence', '// the list of TODO items'],
  ])('passes %s', (_name, comment) => {
    expect(reported(comment)).toBe(false);
  });
});
