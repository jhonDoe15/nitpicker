import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { applySkillSection, applySnippetSections } from './fix-loop.mts';
import { SLOTS } from './fix-loop-slots.mts';
import { SUPPORTED_PRESETS } from '../configuration/validate.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const read = (file: string): string => readFileSync(path.join(root, file), 'utf8');
const gateSection = (text: string): string =>
  (/^## Finish with the gate\n[\s\S]*?(?=\n## )/mu.exec(text)?.[0] ?? '').replaceAll(/\s+/gu, ' ');

const SHARED_PHRASES = [
  'without a pipe',
  'reports/quality/diff/report.txt',
  'leave that code alone',
  'Never suppress',
  'Never add one',
];

describe('the fix loop', () => {
  it('has slots for every preset', () => {
    expect(SLOTS.map((slots) => slots.preset).toSorted()).toEqual(
      [...SUPPORTED_PRESETS].toSorted(),
    );
  });

  it.each(SLOTS.map((slots) => slots.preset))(
    'matches the generated "Finish with the gate" section of the %s skill',
    (preset) => {
      const file = `skills/nitpicker-${preset}/SKILL.md`;
      const text = read(file);
      expect(applySkillSection(preset)(text), `run npm run gen:checks to update ${file}`).toBe(
        text,
      );
    },
  );

  it('matches the generated sections of docs/agents-snippet.md', () => {
    const text = read('docs/agents-snippet.md');
    expect(applySnippetSections(text), 'run npm run gen:checks to update the snippet').toBe(text);
  });

  it.each(SLOTS.map((slots) => slots.preset))(
    'states the shared loop in the %s skill',
    (preset) => {
      const section = gateSection(read(`skills/nitpicker-${preset}/SKILL.md`));
      expect(SHARED_PHRASES.filter((phrase) => section.includes(phrase))).toEqual(SHARED_PHRASES);
      expect(section.includes('Re-read the files `--fix` changed')).toBe(
        SLOTS.find((slots) => slots.preset === preset)?.hasFix,
      );
    },
  );
});
