import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Parser } from 'web-tree-sitter';
import { loadGrammar } from '../../../java/adapters/near-duplicates/grammar/load-grammar.mjs';
import { goUnitFacts } from './go-unit-facts.mjs';
import { readGoUnits } from './go-trees.mjs';

const SOURCE = [
  'package demo',
  '',
  'func Clamp(n int) int {',
  '\tif n > 10 {',
  '\t\treturn 10',
  '\t}',
  '\treturn n',
  '}',
  '',
].join('\n');

let root;

beforeAll(() => {
  root = mkdtempSync(path.join(tmpdir(), 'nitpicker-go-trees-'));
  writeFileSync(path.join(root, 'demo.go'), SOURCE);
  writeFileSync(path.join(root, 'broken.go'), 'package demo\n\nfunc Broken( {\n');
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('the tree-sitter Go grammar', () => {
  it('loads with the web-tree-sitter of the repository and parses a function', async () => {
    await Parser.init();
    const parser = new Parser();
    parser.setLanguage(await loadGrammar('go'));
    const tree = parser.parse(SOURCE);

    expect(tree.rootNode.hasError).toBe(false);
    expect(tree.rootNode.namedChildren.map(({ type }) => type)).toEqual([
      'package_clause',
      'function_declaration',
    ]);
    tree.delete();
  });

  it('gives the units of a Go file through its trees process', () => {
    const units = readGoUnits(root, ['demo.go']);

    expect(units.map(({ id, final, start, end }) => ({ id, final, start, end }))).toEqual([
      { id: 'demo.go#Clamp(int)', final: true, start: 3, end: 8 },
    ]);
  });

  it('keeps the units of the other files when one file does not parse cleanly', () => {
    const units = readGoUnits(root, ['broken.go', 'demo.go']);

    expect(units.map(({ name }) => name)).toEqual(['Clamp(int)']);
  });

  it('reads production files only, from the files of an inspect report', () => {
    const report = {
      files: [
        { path: 'demo.go', test: false, generated: false },
        { path: 'demo_test.go', test: true, generated: false },
        { path: 'gen.go', test: false, generated: true },
      ],
    };

    expect(goUnitFacts(root, report).map(({ file }) => file)).toEqual(['demo.go']);
  });
});
