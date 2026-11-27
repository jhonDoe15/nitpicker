import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import * as tsParser from '@typescript-eslint/parser';
import { Linter, type Rule } from 'eslint';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { replayEngineFindingsFrom } from '../../../../../shared/engine/engine-findings-file.mts';
import { engineCovers, replayedByEngine } from './engine-replay.mts';
import { writeReplay } from './replay-file.mts';

let folder: string;

beforeAll(() => {
  folder = mkdtempSync(path.join(tmpdir(), 'nitpicker-engine-replay-'));
  const file = path.join(folder, 'replay.jsonl');
  writeReplay(file, {
    file: ['a.ts', 'b.ts'],
    rule: ['asked', 'typed'],
    typedFile: ['a.ts'],
    typedRule: ['typed'],
    finding: [
      ['a.ts', 'asked', 1, 1, 'plain'],
      ['a.ts', 'asked', 2, 1, 'holds', null, null, [['answer', 'yes']]],
      ['a.ts', 'asked', 3, 1, 'fails', null, null, [['answer', 'no']]],
      ['a.ts', 'asked', 4, 1, 'half', null, null, [['answer']]],
      ['a.ts', 'asked', 5, 1, 'empty', null, null, [[]]],
      ['a.ts', 'asked', 'line', 1, 'unplaced'],
    ],
  });
  replayEngineFindingsFrom(file);
});

afterAll(() => {
  replayEngineFindingsFrom(undefined);
  rmSync(folder, { recursive: true, force: true });
});

const OWN_REPORT = 'reported by the rule itself';

function ownRule(requiresTypeChecking: boolean): Rule.RuleModule {
  const docs: object = { requiresTypeChecking };
  return {
    meta: { docs },
    create: (context) => ({
      Program(node) {
        context.report({ node, message: OWN_REPORT });
      },
    }),
  };
}

const withProgram = {
  parseForESLint(code: string, options?: Parameters<typeof tsParser.parseForESLint>[1]) {
    const parsed = tsParser.parseForESLint(code, options);
    return { ...parsed, services: { ...parsed.services, program: {} } };
  },
};

function messages(
  {
    ruleId,
    rule,
    holds,
  }: { ruleId: string; rule: Rule.RuleModule; holds?: Parameters<typeof replayedByEngine>[2] },
  { file, parser = tsParser }: { file: string; parser?: object },
): string[] {
  const linter = new Linter({ cwd: folder });
  return linter
    .verify(
      'const value = 1;\n',
      [
        {
          files: ['**/*.ts'],
          languageOptions: { parser },
          plugins: { replay: { rules: { rule: replayedByEngine(ruleId, rule, holds) } } },
          rules: { 'replay/rule': 'error' },
        },
      ],
      path.join(folder, file),
    )
    .map(({ message, line }) => `${String(line)} ${message}`);
}

describe('rules replayed from the engine', () => {
  it('replays only the findings with no conditions by default and skips rows with no place', () => {
    expect(messages({ ruleId: 'asked', rule: ownRule(false) }, { file: 'a.ts' })).toEqual([
      '1 plain',
    ]);
  });

  it('replays the findings whose conditions hold', () => {
    const holds = (conditions: readonly (readonly [string, string])[]) =>
      conditions.every(([kind, value]) => kind === 'answer' && value !== 'no');

    expect(messages({ ruleId: 'asked', rule: ownRule(false), holds }, { file: 'a.ts' })).toEqual([
      '1 plain',
      '2 holds',
      '4 half',
    ]);
  });

  it('reports nothing for a covered file the engine found nothing in', () => {
    expect(messages({ ruleId: 'asked', rule: ownRule(false) }, { file: 'b.ts' })).toEqual([]);
  });

  it('runs the rule itself on files the engine did not cover', () => {
    expect(messages({ ruleId: 'asked', rule: ownRule(true) }, { file: 'c.ts' })).toEqual([
      `1 ${OWN_REPORT}`,
    ]);
    expect(messages({ ruleId: 'typed', rule: ownRule(false) }, { file: 'b.ts' })).toEqual([
      `1 ${OWN_REPORT}`,
    ]);
    expect(
      messages({ ruleId: 'typed', rule: ownRule(true) }, { file: 'b.ts', parser: withProgram }),
    ).toEqual([`1 ${OWN_REPORT}`]);
  });

  it('skips a typed rule the engine left uncovered when there is no program to run it on', () => {
    expect(messages({ ruleId: 'typed', rule: ownRule(true) }, { file: 'b.ts' })).toEqual([]);
  });

  it('covers nothing when the replay file is empty', () => {
    replayEngineFindingsFrom('');
    try {
      expect(engineCovers('asked', { cwd: folder, filename: path.join(folder, 'a.ts') })).toBe(
        false,
      );
    } finally {
      replayEngineFindingsFrom(path.join(folder, 'replay.jsonl'));
    }
  });
});
