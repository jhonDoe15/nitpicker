import { createHash } from 'node:crypto';
import { appendFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { AnswerStore } from '../logic/typed/solver-types.mts';

export const SOLVER_ANSWERS_ENVIRONMENT = 'NITPICKER_SOLVER_ANSWERS';

const ANSWERS_FILE = 'answers.jsonl';
const DIGEST = /^[0-9a-f]{64}$/u;
const NO_STORE: AnswerStore = { find: () => undefined, keep: () => undefined };

function digestOf(id: string): string {
  return createHash('sha256').update(id).digest('hex');
}

function cellsOf(line: string): readonly unknown[] {
  try {
    const cells: unknown = JSON.parse(line);
    return Array.isArray(cells) ? cells : [];
  } catch (error) {
    return error instanceof SyntaxError ? [] : [error];
  }
}

function entryOf(line: string): readonly [string, unknown] | undefined {
  const [digest, result, ...rest] = cellsOf(line);
  return typeof digest === 'string' &&
    DIGEST.test(digest) &&
    result !== undefined &&
    rest.length === 0
    ? [digest, result]
    : undefined;
}

function linesOf(file: string): string[] {
  try {
    return readFileSync(file, 'utf8').split(/\r?\n/u).slice(0, -1);
  } catch (error) {
    return error instanceof Error ? [] : [String(error)];
  }
}

function storedAnswers(file: string): Map<string, unknown> {
  return new Map(
    linesOf(file)
      .map(entryOf)
      .filter((entry) => entry !== undefined),
  );
}

function appendFailure(file: string, line: string): unknown {
  try {
    appendFileSync(file, line);
    return undefined;
  } catch (error) {
    return error ?? new Error(`could not append to ${file}`);
  }
}

/**
 * The solver's answers kept in `directory` for every process of a run: one process answers a
 * question and the ones started later read the answer instead of asking again. Keep only what the
 * solver itself answered, not a failure. Without a directory, or a file that can be read and
 * written, nothing is kept.
 */
export function answerStore(directory: string | undefined): AnswerStore {
  if (directory === undefined || directory.length === 0) {
    return NO_STORE;
  }
  const file = path.join(directory, ANSWERS_FILE);
  const loaded: Map<string, unknown>[] = [];
  function known(): Map<string, unknown> {
    const [first = storedAnswers(file)] = loaded;
    if (loaded.length === 0) {
      loaded.push(first);
    }
    return first;
  }
  return {
    find: (id) => known().get(digestOf(id)),
    keep(id, result) {
      const digest = digestOf(id);
      if (known().has(digest)) {
        return;
      }
      if (appendFailure(file, `${JSON.stringify([digest, result])}\n`) === undefined) {
        known().set(digest, result);
      }
    },
  };
}
