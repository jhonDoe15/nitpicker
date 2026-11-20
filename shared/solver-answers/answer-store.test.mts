import { appendFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { answerStore } from './answer-store.mts';

const folders: string[] = [];

function folder(): string {
  const made = mkdtempSync(path.join(tmpdir(), 'nitpicker-answers-test-'));
  folders.push(made);
  return made;
}

function linesOf(directory: string): string[] {
  return readFileSync(path.join(directory, 'answers.jsonl'), 'utf8').split('\n').slice(0, -1);
}

afterEach(() => {
  for (const made of folders.splice(0)) {
    rmSync(made, { recursive: true, force: true });
  }
});

describe('the solver answers of a run', () => {
  it('gives a later process the answers an earlier one kept', () => {
    const directory = folder();
    const earlier = answerStore(directory);
    earlier.keep('first question', 'true');
    earlier.keep('second question', { count: 20 });

    const later = answerStore(directory);

    expect([
      later.find('first question'),
      later.find('second question'),
      later.find('third question'),
    ]).toEqual(['true', { count: 20 }, undefined]);
  });

  it('writes an answer once, also when it is kept again', () => {
    const directory = folder();
    const store = answerStore(directory);

    store.keep('question', 'open');
    store.keep('question', 'open');

    expect(linesOf(directory)).toHaveLength(1);
    expect(store.find('question')).toBe('open');
  });

  it('keeps the first answer when another process wrote the question meanwhile', () => {
    const directory = folder();
    answerStore(directory).keep('question', 'false');
    const store = answerStore(directory);

    store.keep('question', 'true');

    expect(store.find('question')).toBe('false');
    expect(linesOf(directory)).toHaveLength(1);
  });

  it('skips lines that are cut off or are not answers', () => {
    const directory = folder();
    answerStore(directory).keep('whole', 'true');
    const [whole = ''] = linesOf(directory);
    appendFileSync(
      path.join(directory, 'answers.jsonl'),
      ['not json', '["short","true"]', '{"digest":"x"}', whole.slice(0, 40)].join('\n'),
    );

    const store = answerStore(directory);

    expect(store.find('whole')).toBe('true');
    expect(store.find('short')).toBeUndefined();
  });

  it('reads an answer written without its line end only when the line is complete', () => {
    const directory = folder();
    answerStore(directory).keep('question', 'true');
    const file = path.join(directory, 'answers.jsonl');
    writeFileSync(file, readFileSync(file, 'utf8').trimEnd());

    expect(answerStore(directory).find('question')).toBeUndefined();
  });

  it.each([[undefined], [''], [path.join(tmpdir(), 'nitpicker-answers-test-missing', 'folder')]])(
    'keeps nothing and fails nothing without a usable folder: %s',
    (directory) => {
      const store = answerStore(directory);

      expect(() => {
        store.keep('question', 'true');
      }).not.toThrow();
      expect(store.find('question')).toBeUndefined();
    },
  );
});
