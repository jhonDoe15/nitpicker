import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { executedScript } from './executed-script.mjs';

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

function sourceFile() {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-executed-'));
  roots.push(root);
  const file = path.join(root, 'sign.ts');
  writeFileSync(file, SOURCE);
  return file;
}

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
    const inline = Buffer.from(JSON.stringify(SOURCE_MAP)).toString('base64');
    const ran = `${REWRITTEN}//# sourceMappingURL=data:application/json;base64,${inline}\n`;

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
});
