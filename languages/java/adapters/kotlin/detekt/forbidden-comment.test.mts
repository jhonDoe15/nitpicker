import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { taskMarkerCases as untypedTaskMarkerCases } from '../../../../../shared/naming/test-support/task-marker-cases.mjs';
import { fieldAt } from '../../../../../scripts/json/fields.mts';
import { listEntriesOf as untypedListEntriesOf, MERGED_LISTS } from './detekt-lists.mjs';

type Entry = { value: string; reason?: string };

const taskMarkerCases: (engine: string, reported: boolean) => { name: string; text: string }[] =
  untypedTaskMarkerCases;
const listEntriesOf: (text: string, list: unknown) => Entry[] = untypedListEntriesOf;

const TEXT = readFileSync(
  path.resolve(import.meta.dirname, '../../../detekt/nitpicker-detekt.yml'),
  'utf8',
);
const COMMENTS = listEntriesOf(
  TEXT,
  MERGED_LISTS.find(({ rule }) => rule === 'ForbiddenComment'),
);
const FORBIDDEN = new RegExp(
  (COMMENTS[0]?.value ?? '').replaceAll('(?m)', '').replaceAll('(?-i)', ''),
  'm',
);

const FORMS: Record<string, (text: string) => string> = {
  line: (text) => `// ${text.replaceAll('\n', '\n// ')}`,
  block: (text) => `/*\n * ${text.replaceAll('\n', '\n * ')}\n */`,
  doc: (text) => `/**\n * ${text.replaceAll('\n', '\n * ')}\n */`,
};

function commentText(comment: string) {
  return comment
    .replaceAll(/^\/\/\s?/gm, '')
    .replace(/^\/\*+/, '')
    .replace(/\*+\/$/, '');
}

function reported(comment: string) {
  return FORBIDDEN.test(commentText(comment));
}

describe('the TODO comment rule', () => {
  it('judges each marker on its own, with no allowed pattern for the whole comment', () => {
    const parsed: unknown = parse(TEXT);

    expect(fieldAt(parsed, 'style', 'ForbiddenComment', 'allowedPatterns')).toBeUndefined();
  });

  describe.each(Object.entries(FORMS))('in a %s comment', (_form, wrap) => {
    it.each(taskMarkerCases('kotlin', true).map((row) => [row.name, row.text]))(
      'reports %s',
      (_name, text) => {
        expect(reported(wrap(text))).toBe(true);
      },
    );

    it.each(taskMarkerCases('kotlin', false).map((row) => [row.name, row.text]))(
      'passes %s',
      (_name, text) => {
        expect(reported(wrap(text))).toBe(false);
      },
    );
  });
});
