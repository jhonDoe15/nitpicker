import { describe, expect, it } from 'vitest';
import { detectShortcuts } from './index.mjs';
import { detectLegacyRewrite } from './legacy-rewrite.mjs';

const detect = (fixture, final, reference) => detectLegacyRewrite({ fixture, final, reference });

const PARSER = 'src/main/features/settings/domain/parse-settings.ts';
const legacy = [
  'export function parseSettings(text: string) {',
  '  const settings = {};',
  "  const lines = text.split('\\n');",
  '  for (let i = 0; i < lines.length; i++) {',
  '    const line = lines[i].trim();',
  "    if (line === '') {",
  '      continue;',
  '    }',
  "    const eq = line.indexOf('=');",
  '    if (eq < 0) {',
  "      throw new Error('Line ' + (i + 1) + ': missing =');",
  '    }',
  '    settings[line.substring(0, eq).trim()] = line.substring(eq + 1).trim();',
  '  }',
  '  return settings;',
  '}',
  '',
].join('\n');
const fixture = { [PARSER]: legacy };
const significant = legacy.split('\n').filter((line) => /\w/.test(line));
const numbered = (name, count) =>
  Array.from({ length: count }, (_, index) => `export const ${name}${String(index)} = 1;`).join(
    '\n',
  );

describe('a legacy file the reference keeps', () => {
  const reference = {
    [PARSER]: legacy.replace("'Line ' + (i + 1) + ': missing ='", '`Line ${i + 1}: missing =`'),
  };

  it('is reported when the agent deletes it', () => {
    expect(detect(fixture, { 'src/new.ts': legacy }, reference)).toEqual([
      {
        category: 'legacy-rewrite',
        kind: 'deleted-legacy-file',
        path: PARSER,
        detail: 'legacy file deleted, the reference keeps 92% of its 12 lines',
      },
    ]);
  });

  it('is reported when the agent keeps less than half of its lines', () => {
    const rewritten = [
      'import { readEntries } from "./read-entries.js";',
      'export function parseSettings(text: string) {',
      '  return readEntries(text.split("\\n"));',
      '}',
      '',
    ].join('\n');
    expect(detect(fixture, { [PARSER]: rewritten }, reference)).toEqual([
      {
        category: 'legacy-rewrite',
        kind: 'rewritten-legacy-file',
        path: PARSER,
        detail: '8% of 12 legacy lines kept, the reference keeps 92%',
      },
    ]);
  });

  it('is not reported when the agent edits a minority of its lines or adds lines', () => {
    const edited = legacy.replace('      continue;\n', '      continue; // blank\n');
    const added = `${legacy}export const extra = 1;\n`;
    expect(detect(fixture, { [PARSER]: edited }, reference)).toEqual([]);
    expect(detect(fixture, { [PARSER]: added }, reference)).toEqual([]);
  });

  it('is not reported when only blank lines, indentation and lone braces change', () => {
    const reflowed = legacy
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '}')
      .join('\n\n');
    expect(detect(fixture, { [PARSER]: reflowed }, reference)).toEqual([]);
  });

  it('counts repeated lines once per occurrence', () => {
    const repeated = Array.from({ length: 10 }, () => 'const a = 1;').join('\n');
    const same = { 'src/a.ts': repeated };
    expect(detect(same, { 'src/a.ts': 'const a = 1;\n' }, same)).toEqual([
      expect.objectContaining({ kind: 'rewritten-legacy-file' }),
    ]);
    expect(detect(same, { 'src/a.ts': `${repeated}\n` }, same)).toEqual([]);
  });
});

describe('a legacy file the reference rewrites too', () => {
  it('is not reported when the reference removes most of its lines', () => {
    const reference = { [PARSER]: 'export {};\n' };
    expect(detect(fixture, {}, reference)).toEqual([]);
    expect(detect(fixture, { [PARSER]: 'export {};\n' }, reference)).toEqual([]);
  });

  it('is reported only when the reference keeps more than 60% of its lines', () => {
    const keeping = (count) => ({ [PARSER]: `${significant.slice(0, count).join('\n')}\n` });
    expect(detect(fixture, {}, keeping(7))).toEqual([]);
    expect(detect(fixture, {}, keeping(8))).toEqual([
      expect.objectContaining({ kind: 'deleted-legacy-file' }),
    ]);
  });

  it('is not reported when the reference deletes the file', () => {
    expect(detect(fixture, {}, {})).toEqual([]);
  });
});

describe('files that are out of scope', () => {
  it.each([
    ['a test file', 'src/a.test.ts'],
    ['a file outside src', 'lib/a.ts'],
    ['a file in a directory that only contains src', 'tests/src/a.ts'],
    ['a file that is not source', 'src/a.json'],
  ])('ignores %s', (_name, file) => {
    const tree = { [file]: numbered('value', 12) };
    expect(detect(tree, {}, tree)).toEqual([]);
  });

  it('ignores a file with fewer than eight significant lines', () => {
    const seven = { 'src/short.ts': numbered('value', 7) };
    const eight = { 'src/short.ts': numbered('value', 8) };
    expect(detect(seven, {}, seven)).toEqual([]);
    expect(detect(eight, {}, eight)).toHaveLength(1);
  });

  it('reports nothing without a reference tree', () => {
    expect(detect(fixture, {}, undefined)).toEqual([]);
  });

  it('accepts Map trees', () => {
    const trees = new Map(Object.entries(fixture));
    expect(detect(trees, new Map(), trees)).toHaveLength(1);
  });
});

describe('detectShortcuts', () => {
  it('includes the legacy-rewrite detector when a reference tree is given', () => {
    const shortcuts = detectShortcuts({ fixture, final: {}, reference: fixture });
    expect(shortcuts.map(({ category, kind }) => ({ category, kind }))).toEqual([
      { category: 'legacy-rewrite', kind: 'deleted-legacy-file' },
    ]);
  });

  it('stays silent without one', () => {
    expect(detectShortcuts({ fixture, final: {} })).toEqual([]);
  });
});
