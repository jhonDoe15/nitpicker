import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { pathToFileURL } from 'node:url';
import { executedScript, scriptFile } from './executed-script.mjs';

const SOURCE = 'export const sign = (value: number): number => (value > 0 ? 1 : -1);\n';
const STRIPPED = 'export const sign = (value        )         => (value > 0 ? 1 : -1);\n';
const REWRITTEN = 'export const sign=value=>value>0?1:-1;\n';
const SOURCE_MAP = { version: 3, sources: ['sign.ts'], names: [], mappings: 'AAAA' };

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function sourceFile(name = 'sign.ts', text = SOURCE) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-executed-'));
  roots.push(root);
  const file = path.join(root, name);
  writeFileSync(file, text);
  return file;
}

const withInlineMap = (code, sourceMap) =>
  `${code}//# sourceMappingURL=data:application/json;base64,${Buffer.from(JSON.stringify(sourceMap)).toString('base64')}\n`;

const ranThrough = (code) => [
  {
    functionName: '',
    isBlockCoverage: true,
    ranges: [{ startOffset: 0, endOffset: code.length, count: 1 }],
  },
];

describe('the code a test process ran', () => {
  it('is the file with its types stripped when node ran it, even with a sourceURL comment', () => {
    const file = sourceFile();
    const ran = `${STRIPPED}\n\n//# sourceURL=file://${file}`;

    expect(executedScript({ file, functions: ranThrough(ran), loaded: [ran] })).toEqual({
      code: ran,
    });
    expect(executedScript({ file, functions: ranThrough(STRIPPED) })).toEqual({ code: STRIPPED });
  });

  it('is the recorded copy with its inline source map when a loader rewrote the file', () => {
    const file = sourceFile();
    const ran = withInlineMap(REWRITTEN, SOURCE_MAP);

    expect(executedScript({ file, functions: ranThrough(ran), loaded: [STRIPPED, ran] })).toEqual({
      code: ran,
      sourceMap: SOURCE_MAP,
    });
    expect(
      executedScript({
        file,
        functions: ranThrough(REWRITTEN),
        loaded: [REWRITTEN],
        cachedSourceMap: SOURCE_MAP,
      }).sourceMap,
    ).toEqual(SOURCE_MAP);
  });

  it('cannot be mapped back without a copy of it or without a source map', () => {
    const file = sourceFile();

    expect(() => executedScript({ file, functions: ranThrough(REWRITTEN) })).toThrow(
      `the code that ran (${String(REWRITTEN.length)} characters) is not the file (${String(STRIPPED.length)} characters), and no copy of it was recorded`,
    );
    expect(() =>
      executedScript({ file, functions: ranThrough(REWRITTEN), loaded: [REWRITTEN] }),
    ).toThrow(
      'a loader rewrote it without a source map, so its coverage cannot be mapped back to the file',
    );
  });

  it('takes the recorded copy of a file node cannot strip, such as one with an enum', () => {
    const file = sourceFile('kind.ts', 'export enum Kind { A }\n');
    const ran = withInlineMap(
      'export var Kind=(K=>{K[K.A=0]="A";return K})(Kind||{});\n',
      SOURCE_MAP,
    );

    expect(executedScript({ file, functions: ranThrough(ran), loaded: [ran] })).toEqual({
      code: ran,
      sourceMap: SOURCE_MAP,
    });
  });

  it('transforms a file no test loaded that type stripping cannot handle and maps it back', () => {
    const file = sourceFile('kind.ts', 'export enum Kind {\n  A,\n}\n');

    const { code, sourceMap } = executedScript({ file });

    expect(code.includes('enum')).toBe(false);
    expect(sourceMap.sources).toEqual([pathToFileURL(file).href]);
  });

  it('drops the byte order mark that node drops before it compiles the file', () => {
    const file = sourceFile('sign.js', '\uFEFFexport const one = 1;\n');

    expect(executedScript({ file, functions: ranThrough('export const one = 1;\n') })).toEqual({
      code: 'export const one = 1;\n',
    });
    expect(executedScript({ file })).toEqual({ code: 'export const one = 1;\n' });
  });
});

describe('the file of a script V8 ran', () => {
  it('is the path of a plain file URL, and none for a URL with a query such as a module mock', () => {
    const file = path.join(tmpdir(), 'pick.ts');

    expect(scriptFile(pathToFileURL(file).href)).toBe(file);
    expect(scriptFile(file)).toBe(file);
    expect(scriptFile(`${pathToFileURL(file).href}?node-test-mock=0`)).toBeUndefined();
    expect(scriptFile(`${pathToFileURL(file).href}?esmk=1`)).toBeUndefined();
    expect(scriptFile('node:fs')).toBeUndefined();
  });
});
