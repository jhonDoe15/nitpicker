import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { fixWorkingTree } from '../../../core/fix/run-fix.mts';
import type { FixInvocation } from '../../../core/fix/typed/fix-types.mts';
import {
  fixOptions,
  fixtureGit,
  operationOf,
  useGitFixtures,
  writeFiles,
} from './test-support/fix-test-support.mts';

const { createGitRepository } = useGitFixtures();
const NAME = 'src/a.ts';

type Edit = { readonly range: readonly number[]; readonly text: string };

function suggestion(ruleId: string, edit: Edit) {
  return { ruleId, line: 1, suggestions: [{ fix: edit }] };
}

function editOf(text: string, target: string, replacement: string): Edit | undefined {
  const start = text.indexOf(target);
  return start === -1 ? undefined : { range: [start, start + target.length], text: replacement };
}

function nestedMessages(text: string) {
  const end = text.indexOf(';');
  const outer = text.startsWith('outer(')
    ? [
        suggestion('nitpicker/outer', {
          range: [0, end],
          text: text.slice(0, end).replace('outer', 'outer2'),
        }),
      ]
    : [];
  const inner = editOf(text, 'inner()', 'inner2()');
  return [...outer, ...(inner === undefined ? [] : [suggestion('nitpicker/inner', inner)])];
}

function growingMessages() {
  return [suggestion('nitpicker/grow', { range: [0, 0], text: 'a' })];
}

function fixWith(
  source: string,
  messagesOf: (text: string) => readonly unknown[],
  rules: readonly string[],
) {
  const repository = createGitRepository({}, { baseRef: 'base' });
  fixtureGit(repository.root, ['checkout', '-q', '-b', 'topic']);
  writeFiles(repository.root, { [NAME]: source });
  const runs: string[] = [];
  const result = fixWorkingTree(
    fixOptions(repository.root, {
      headPolicy: { exclude: [], conventions: {} },
      config: { preset: 'typescript' },
      selectedRules: rules,
      executeFixCommand: (invocation: FixInvocation) => {
        if (operationOf(invocation) !== 'eslint-fix') {
          return undefined;
        }
        const file = path.join(repository.root, NAME);
        const text = readFileSync(file, 'utf8');
        runs.push(text);
        return {
          status: 1,
          stdout: JSON.stringify([{ filePath: file, messages: messagesOf(text) }]),
          stderr: '',
        };
      },
    }),
  );
  return { result, runs, text: readFileSync(path.join(repository.root, NAME), 'utf8') };
}

describe('the selected ESLint step repeats on the files it changed', () => {
  it('applies two overlapping suggestions of one file in two passes', () => {
    const { result, runs, text } = fixWith('outer(inner());\n', nestedMessages, [
      'eslint-lint/nitpicker/outer',
      'eslint-lint/nitpicker/inner',
    ]);

    expect(text).toBe('outer2(inner2());\n');
    expect(runs).toEqual(['outer(inner());\n', 'outer2(inner());\n', 'outer2(inner2());\n']);
    expect(result.fixedFindings).toEqual([
      `${NAME}:1 eslint-lint/nitpicker/outer (eslint-suggestion)`,
      `${NAME}:1 eslint-lint/nitpicker/inner (eslint-suggestion)`,
    ]);
    expect(result.notes?.filter((note) => note.includes('passes'))).toEqual([]);
  });
  it('stops a fix that keeps reporting itself after 10 passes and says so', () => {
    const { result, runs, text } = fixWith('grow();\n', growingMessages, [
      'eslint-lint/nitpicker/grow',
    ]);

    expect(runs).toHaveLength(10);
    expect(text).toBe(`${'a'.repeat(10)}grow();\n`);
    expect(result.fixedFindings).toEqual([
      `${NAME}:1 eslint-lint/nitpicker/grow (eslint-suggestion)`,
    ]);
    expect(result.notes).toEqual([
      'eslint --fix rewrote src/a.ts',
      'eslint --fix stopped after 10 passes: selected fixes may still apply',
    ]);
  });
});
