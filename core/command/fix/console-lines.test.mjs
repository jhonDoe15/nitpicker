import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CONSOLE_LINE_LIMIT,
  FIX_LOG_FILE,
  cappedLines,
  sectionText,
  writeFixLog,
} from './console-lines.mts';
import { FIXES_FILE, reportDryRun } from './dry-run-report.mts';

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function outputRoot() {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-console-lines-'));
  roots.push(root);
  return root;
}

const numbered = (count) => Array.from({ length: count }, (_, index) => `line ${String(index)}`);

describe('cappedLines', () => {
  it('keeps a list of up to the limit', () => {
    expect(cappedLines(numbered(CONSOLE_LINE_LIMIT), 'x.log')).toEqual(
      numbered(CONSOLE_LINE_LIMIT),
    );
  });
  it('cuts a longer list to the limit and says how many more there are', () => {
    expect(cappedLines(numbered(CONSOLE_LINE_LIMIT + 7), 'x.log')).toEqual([
      ...numbered(CONSOLE_LINE_LIMIT),
      '... and 7 more, see x.log',
    ]);
  });
});

describe('sectionText', () => {
  it('prints nothing for an empty section', () => {
    expect(sectionText({ heading: 'Fix notes', lines: [] }, 'x.log')).toBe('');
  });
});

describe('writeFixLog', () => {
  it('writes every line to fix.log only when a section was cut, and removes an older log', () => {
    const root = outputRoot();
    const lines = numbered(CONSOLE_LINE_LIMIT + 5);

    writeFixLog(root, [{ heading: 'Fix notes', lines }]);
    const written = readFileSync(path.join(root, FIX_LOG_FILE), 'utf8');
    writeFixLog(root, [{ heading: 'Fix notes', lines: numbered(2) }]);

    expect(written).toBe(`Fix notes:\n${lines.map((line) => `  ${line}\n`).join('')}`);
    expect(existsSync(path.join(root, FIX_LOG_FILE))).toBe(false);
  });
});

describe('reportDryRun', () => {
  it('lists the first fixes and points to fixes.json for the rest', () => {
    const root = outputRoot();
    const fixes = Array.from({ length: CONSOLE_LINE_LIMIT + 3 }, (_, index) => ({
      tool: 'format',
      safety: 'safe',
      files: [`f${String(index)}.txt`],
    }));
    const lines = [];

    reportDryRun({ write: (text) => lines.push(text) }, root, { patch: Buffer.alloc(0), fixes });

    const shown = fixes
      .slice(0, CONSOLE_LINE_LIMIT)
      .map(({ files }) => `  format would rewrite ${files[0]}\n`);
    expect(lines).toEqual([
      `Fixes that --fix would apply (dry run, nothing was written to your files): ${String(fixes.length)}\n${shown.join('')}  ... and 3 more, see ${path.join(root, FIXES_FILE)}\n`,
      `Patch: ${path.join(root, 'fix.patch')}\nFixes: ${path.join(root, FIXES_FILE)}\n`,
    ]);
    expect(JSON.parse(readFileSync(path.join(root, FIXES_FILE), 'utf8')).fixes).toEqual(fixes);
  });
});
