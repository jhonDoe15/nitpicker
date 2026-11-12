import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { appendRecord, readRecords } from './results.mjs';

let directory;
beforeAll(() => {
  directory = mkdtempSync(path.join(tmpdir(), 'nitpicker-results-'));
});
afterAll(() => rmSync(directory, { recursive: true, force: true }));

describe('run records', () => {
  it('reads nothing from a directory without records', () => {
    expect(readRecords(path.join(directory, 'absent'))).toEqual([]);
  });

  it('appends one line per record and reads them back in order', () => {
    const target = path.join(directory, 'ordered');
    appendRecord(target, { caseId: 'a', run: 1, output: 'two\nlines' });
    appendRecord(target, { caseId: 'b', run: 2 });
    const text = readFileSync(path.join(target, 'runs.jsonl'), 'utf8');
    expect(text.split('\n').filter(Boolean)).toHaveLength(2);
    expect(readRecords(target)).toEqual([
      { caseId: 'a', run: 1, output: 'two\nlines' },
      { caseId: 'b', run: 2 },
    ]);
  });

  it('keeps every line whole when several processes append at once', () => {
    const target = path.join(directory, 'parallel');
    const script = `import { appendRecord } from ${JSON.stringify(new URL('./results.mjs', import.meta.url).href)};
      for (let run = 0; run < 25; run += 1) {
        appendRecord(${JSON.stringify(target)}, { process: process.argv[1], run, padding: 'x'.repeat(5000) });
      }`;
    const processes = ['one', 'two', 'three', 'four'].map((name) =>
      spawnSync('node', ['--input-type=module', '-e', script, name], { encoding: 'utf8' }),
    );
    expect(processes.map((result) => result.status)).toEqual([0, 0, 0, 0]);
    const records = readRecords(target);
    expect(records).toHaveLength(100);
    expect(new Set(records.map((record) => `${record.process}:${String(record.run)}`)).size).toBe(
      100,
    );
  });
});
