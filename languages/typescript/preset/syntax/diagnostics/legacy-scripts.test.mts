import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { typescriptApi } from '../../../adapters/typed/typescript-program.mts';
import { collectSignals } from '../../coding-standards/check.mts';
import { analyzeProductionFiles, analyzeSource } from '../../structure/analyze.mts';
import { blockingParseDiagnostics } from './legacy-scripts.mts';

const ts = typescriptApi();
const LEGACY_SCRIPT =
  "var fs = require('fs');\n\nfunction makeExecutable(path) {\n  fs.chmodSync(path, 0755);\n}\n";
const policyRoot = path.resolve(import.meta.dirname, '../../../../..');

function codes(filename: string, source: string): number[] {
  const file = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true);
  const found: unknown = Reflect.get(file, 'parseDiagnostics');
  const diagnostics = Array.isArray(found) ? found.filter((item) => typeof item === 'object') : [];
  return blockingParseDiagnostics(filename, diagnostics).map(({ code }) => Number(code));
}

describe('legacy script syntax', () => {
  it('accepts sloppy-mode octal literals and escapes in JavaScript files only', () => {
    const source = 'var a = 0755; var b = 08; var c = "\\101";\n';
    expect(codes('lib/mode.js', source)).toEqual([]);
    expect(codes('lib/mode.cjs', source)).toEqual([]);
    expect(codes('lib/mode.mjs', source)).toEqual([1121, 1489, 1487]);
    expect(codes('src/mode.ts', source)).toEqual([1121, 1489, 1487]);
    expect(codes('lib/broken.js', 'var = ;')).toEqual([1134]);
  });

  it('measures a CommonJS file with a legacy octal literal', () => {
    expect(analyzeSource(LEGACY_SCRIPT, 'lib/mode.js').functions).toEqual([
      {
        source: 'lib/mode.js',
        function: 'makeExecutable',
        start: 3,
        end: 5,
        lines: 3,
        parameters: 1,
        statements: 1,
        maxControlNesting: 0,
      },
    ]);
  });

  it('measures the other files when one file does not parse', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-legacy-script-'));
    try {
      mkdirSync(path.join(root, 'src'));
      writeFileSync(path.join(root, 'src/ok.ts'), 'export function ok() {\n  return 1;\n}\n');
      writeFileSync(path.join(root, 'src/broken.ts'), 'export function (\n');
      const analysis = analyzeProductionFiles(path.join(root, 'src'), 'src');
      expect(analysis.functions.map(({ source }) => source)).toEqual(['src/ok.ts']);
      expect(analysis.unparsed).toEqual([
        { file: 'src/broken.ts', reason: "Identifier expected.; ')' expected." },
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('checks coding standards on a legacy script and notes a file that does not parse', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-legacy-standards-'));
    try {
      mkdirSync(path.join(root, 'src/main'), { recursive: true });
      writeFileSync(path.join(root, 'src/main/mode.js'), LEGACY_SCRIPT);
      writeFileSync(path.join(root, 'src/main/broken.ts'), 'export function (\n');
      const signals = await collectSignals(root, policyRoot);
      expect(signals).toEqual([
        {
          file: 'src/main/broken.ts',
          rule: 'unparsed-file',
          source: 'Parsing error: Identifier expected.',
          message:
            'coding-standards could not parse src/main/broken.ts (Parsing error: Identifier expected.), ' +
            'so it did not check this file; the other files were checked.',
          unparsed: true,
        },
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
