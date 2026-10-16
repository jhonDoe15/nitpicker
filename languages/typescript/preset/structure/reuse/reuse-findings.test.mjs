import { describe, expect, it } from 'vitest';
import { findingsOf, reactFiles, rows, usesValues } from '../test-support/reuse-project.mjs';

describe('reuse findings', () => {
  it('parses JSX in .tsx and .jsx files', () => {
    const copy = (name) =>
      `export const LIMIT = 5;\nexport const ${name} = () => <div className="x">{LIMIT}</div>;\n`;
    const files = reactFiles({ 'src/a.tsx': copy('A'), 'src/b.jsx': copy('B') });

    expect(rows(findingsOf(files))).toEqual([
      ['duplicate-definition', 'src/a.tsx', 'duplicate:LIMIT'],
      ['duplicate-definition', 'src/b.jsx', 'duplicate:LIMIT'],
    ]);
  });

  it('runs for the JavaScript preset on .js files and leaves .jsx and .tsx outside it', () => {
    const copy = `export const LIMIT = 5;\nexport function get(a) {\n  return a;\n}\n${usesValues('LIMIT', 'get')}`;
    const files = reactFiles(
      {
        'src/a.js': copy,
        'src/b.mjs': copy,
        'src/c.jsx': copy,
        'src/d.js': "import { get } from './a.js';\nimport { get as other } from './e.js';\n",
        'src/e.js': 'export function get(a, b) {\n  return b;\n}\n',
        'src/arrow.svg': '<svg viewBox="0 0 24 24"></svg>\n',
      },
      { 'lucide-react': '1.0.0' },
    );

    expect(rows(findingsOf(files, { preset: 'javascript' }))).toEqual([
      ['duplicate-definition', 'src/a.js', 'duplicate:get'],
      ['duplicate-definition', 'src/a.js', 'duplicate:LIMIT'],
      ['exported-name-collision', 'src/a.js', 'collision:get'],
      ['new-icon-asset', 'src/arrow.svg', 'new-icon-asset'],
      ['duplicate-definition', 'src/b.mjs', 'duplicate:get'],
      ['duplicate-definition', 'src/b.mjs', 'duplicate:LIMIT'],
      ['exported-name-collision', 'src/e.js', 'collision:get'],
    ]);
  });

  it('reports nothing for a project without source files', () => {
    expect(findingsOf({ 'README.md': 'x' })).toEqual([]);
  });

  it('keeps one finding per rule, path and identity', () => {
    const copy = `export function f(): void;\nexport function f(a?: number) { return a; }\n${usesValues('f')}`;

    expect(rows(findingsOf({ 'src/a.ts': copy, 'src/b.ts': copy }))).toEqual([
      ['duplicate-definition', 'src/a.ts', 'duplicate:f'],
      ['duplicate-definition', 'src/b.ts', 'duplicate:f'],
    ]);
  });
});
