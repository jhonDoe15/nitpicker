import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { appendRecordAsSingleWrite, readRecords } from './results.mts';

let directory: string;
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
    appendRecordAsSingleWrite(target, { caseId: 'a', run: 1, output: 'two\nlines' });
    appendRecordAsSingleWrite(target, { caseId: 'b', run: 2 });
    const text = readFileSync(path.join(target, 'runs.jsonl'), 'utf8');
    expect(text.split('\n').filter(Boolean)).toHaveLength(2);
    expect(readRecords(target)).toEqual([
      { caseId: 'a', run: 1, output: 'two\nlines' },
      { caseId: 'b', run: 2 },
    ]);
  });

  it('keeps every line whole when several processes append at once', () => {
    const target = path.join(directory, 'parallel');
    const resultsModule = JSON.stringify(new URL('./results.mts', import.meta.url).href);
    const record = "{ process: process.argv[1], run, padding: 'x'.repeat(5000) }";
    const script = `import { appendRecordAsSingleWrite } from ${resultsModule};
      for (let run = 0; run < 25; run += 1) {
        appendRecordAsSingleWrite(${JSON.stringify(target)}, ${record});
      }`;
    const processes = ['one', 'two', 'three', 'four'].map((name) =>
      spawnSync('node', ['--input-type=module', '-e', script, name], { encoding: 'utf8' }),
    );
    expect(processes.map((result) => result.status)).toEqual([0, 0, 0, 0]);
    const records = readRecords(target);
    expect(records).toHaveLength(100);
    expect(
      new Set(records.map((record) => `${String(record['process'])}:${String(record['run'])}`))
        .size,
    ).toBe(100);
  });
});
