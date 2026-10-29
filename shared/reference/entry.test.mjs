import { describe, expect, it } from 'vitest';
import {
  anchorOf,
  entriesFrom,
  exceptionAdvice,
  exceptionFor,
  exceptionSnippet,
  PRESET_TITLES,
  PRESETS,
  ruleEntry,
} from './entry.mjs';

describe('anchorOf', () => {
  it('joins the tool and the rule in lowercase with single dashes', () => {
    expect(anchorOf('eslint', '@typescript-eslint/no-explicit-any')).toBe(
      'eslint-typescript-eslint-no-explicit-any',
    );
    expect(anchorOf('detekt', 'detekt.style.MagicNumber')).toBe('detekt-detekt-style-magicnumber');
    expect(anchorOf('mypy', '<error code>')).toBe('mypy-error-code');
  });
});

describe('ruleEntry', () => {
  it('derives the id and the anchor and keeps the other fields', () => {
    expect(ruleEntry({ tool: 'pmd', rule: 'UnusedLocalVariable', page: 'java-pmd' })).toEqual({
      id: 'pmd/UnusedLocalVariable',
      tool: 'pmd',
      rule: 'UnusedLocalVariable',
      anchor: 'pmd-unusedlocalvariable',
      page: 'java-pmd',
    });
  });
});

describe('the presets', () => {
  it('lists each preset with a title', () => {
    expect(PRESETS).toEqual(['typescript', 'javascript', 'java', 'kotlin', 'python']);
    expect(PRESET_TITLES.typescript).toBe('TypeScript');
  });
});

describe('exceptionSnippet', () => {
  it('leaves the path and reason for the reader and adds the keys the rule needs', () => {
    expect(exceptionSnippet({ rule: 'pmd/X' })).toBe(
      '{"rule":"pmd/X","paths":["<path>"],"reason":"..."}',
    );
    expect(
      exceptionSnippet({ rule: 'structure/function-lines-limit', function: true, name: true }),
    ).toBe(
      '{"rule":"structure/function-lines-limit","paths":["<path>"],"function":"<function>","name":"<name>","reason":"..."}',
    );
    expect(exceptionSnippet({ rule: 'dead-code/unlisted', packages: true })).toBe(
      '{"rule":"dead-code/unlisted","paths":["<path>"],"packages":["<package>"],"reason":"..."}',
    );
  });
});

describe('exceptionAdvice', () => {
  it('gives the note alone for a rule with no exception', () => {
    expect(exceptionAdvice({ exception: { note: 'It has no exception.' } })).toBe(
      'It has no exception.',
    );
  });

  it('names the config list, then the route of each preset that differs, the preset notes and the note', () => {
    const advice = exceptionAdvice(
      {
        exception: {
          key: 'exceptions',
          rule: 'structure/file-lines',
          presetKeys: { python: 'python.exceptions' },
          presetRules: { typescript: 'nitpicker/file-lines' },
          presetNotes: { kotlin: 'The Kotlin preset has no exception for it.' },
          note: 'Name the function.',
        },
      },
      ['typescript', 'java', 'kotlin', 'python'],
    );

    expect(advice).toBe(
      'If this is intended, add `{"rule":"structure/file-lines","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. ' +
        'With the TypeScript preset: If this is intended, add `{"rule":"nitpicker/file-lines","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json. ' +
        'With the Python preset: If this is intended, add `{"rule":"structure/file-lines","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json. ' +
        'With the Kotlin preset: The Kotlin preset has no exception for it. Name the function.',
    );
  });
});

describe('exceptionFor', () => {
  const entry = {
    exception: {
      key: 'exceptions',
      rule: 'doc-comment-content',
      presetKeys: { python: 'python.exceptions' },
      presetRules: { typescript: 'nitpicker/no-comments' },
      presetNotes: { kotlin: 'None in Kotlin.' },
    },
  };

  it('gives the list and rule a preset takes, and none where the preset has a note', () => {
    expect(exceptionFor(entry, 'java')).toEqual({ ...entry.exception });
    expect(exceptionFor(entry, 'typescript').rule).toBe('nitpicker/no-comments');
    expect(exceptionFor(entry, 'python').key).toBe('python.exceptions');
    expect(exceptionFor(entry, 'kotlin')).toBeUndefined();
    expect(exceptionFor({ exception: { note: 'No exception.' } }, 'java')).toBeUndefined();
  });
});

describe('entriesFrom', () => {
  it('shares the defaults and lifts each rule as tool/rule unless the row says otherwise', () => {
    const entries = entriesFrom({ tool: 'demo', page: 'checks' }, [
      ['one', 'Summary one.', 'Do it this way.'],
      ['two', 'Summary two.', undefined, { exception: { note: 'None.' } }],
    ]);

    expect(entries.map(({ id, summary, allowed }) => [id, summary, allowed])).toEqual([
      ['demo/one', 'Summary one.', 'Do it this way.'],
      ['demo/two', 'Summary two.', undefined],
    ]);
    expect(entries[0].exception).toEqual({ key: 'exceptions', rule: 'demo/one' });
    expect(entries[1].exception).toEqual({ note: 'None.' });
    expect(entries[0].page).toBe('checks');
  });

  it('uses the exception key and rule function of the defaults', () => {
    const [entry] = entriesFrom(
      { tool: 'ruff', exceptionKey: 'python.exceptions', exceptionRule: (rule) => rule },
      [['F401', 'Unused import.']],
    );

    expect(entry.exception).toEqual({ key: 'python.exceptions', rule: 'F401' });
  });
});
