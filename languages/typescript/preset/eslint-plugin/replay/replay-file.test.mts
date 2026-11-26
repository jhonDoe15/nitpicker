import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Linter } from 'eslint';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { replayEngineFindingsFrom } from '../../../../../shared/engine/engine-findings-file.mts';
import { engineCovers, replayedByEngine } from './engine-replay.mts';
import { writeReplay } from './replay-file.mts';

let folder: string;

beforeAll(() => {
  folder = mkdtempSync(path.join(tmpdir(), 'nitpicker-replay-'));
  const file = path.join(folder, 'replay.jsonl');
  writeReplay(file, {
    file: ['a.ts', 'b.ts'],
    rule: ['no-thing', 'typed-thing'],
    typedFile: ['a.ts'],
    typedRule: ['typed-thing'],
    finding: [
      ['a.ts', 'no-thing', 3, 5, 'first', 3, 9],
      ['a.ts', 'no-thing', 7, 1, 'second', undefined, undefined],
    ],
  });
  replayEngineFindingsFrom(file);
});

afterAll(() => {
  replayEngineFindingsFrom(undefined);
  rmSync(folder, { recursive: true, force: true });
});

it('reads back which files and rules the engine covered', () => {
  const context = (filename: string) => ({ cwd: folder, filename: path.join(folder, filename) });

  expect(engineCovers('no-thing', context('b.ts'))).toBe(true);
  expect(engineCovers('typed-thing', context('a.ts'))).toBe(true);
  expect(engineCovers('typed-thing', context('b.ts'))).toBe(false);
  expect(engineCovers('other', context('a.ts'))).toBe(false);
});

it('replays the findings of a covered file one per line', () => {
  const linter = new Linter({ cwd: folder });
  const messages = linter.verify(
    'const value = 1;\n',
    [
      {
        files: ['**/*.ts'],
        plugins: {
          replay: { rules: { thing: replayedByEngine('no-thing', { create: () => ({}) }) } },
        },
        rules: { 'replay/thing': 'error' },
      },
    ],
    path.join(folder, 'a.ts'),
  );

  expect(messages.map(({ message, line, column }) => [message, line, column])).toEqual([
    ['first', 3, 5],
    ['second', 7, 1],
  ]);
});
