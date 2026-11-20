import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createJournal, journalWriter } from '../../dry-run/journal.mts';
import type { Journal } from '../../dry-run/journal-types.mts';
import { defineRecipes, runRecipes } from '../../test-support/engine-views.mts';
import type { PlanContext, RecipeSpec } from '../../test-support/engine-views.mts';
import { verifyFixes } from '../verify-fixes.mts';

const roots: string[] = [];
const NAME = 'm.txt';
const SWAPS: Readonly<Record<string, string>> = {
  'FLAG:t/first': 'done-first',
  'FLAG:t/second': 'FLAG:t/worse',
  'FLAG:t/third': 'done-third',
  'FLAG:t/stuck': 'FLAG:t/stuck again',
  'FLAG:t/far': 'done-far FAR',
};

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function swapping(id: string, wanted: readonly string[]): RecipeSpec {
  return {
    id,
    rules: wanted.map((from) => ({ tool: 't', rule: from.slice('FLAG:t/'.length) })),
    presets: ['java'],
    scope: 'file',
    safety: 'safe',
    plan: ({ files }: PlanContext) => ({
      fixes: files.flatMap(({ path: name, text }) =>
        text.split('\n').flatMap((line, index, lines) => {
          const from = wanted.find((candidate) => line === candidate);
          const start = lines.slice(0, index).join('\n').length + (index === 0 ? 0 : 1);
          return from === undefined
            ? []
            : [
                {
                  finding: {
                    tool: 't',
                    rule: from.slice('FLAG:t/'.length),
                    path: name,
                    line: index + 1,
                  },
                  edits: [
                    {
                      type: 'replace',
                      path: name,
                      start,
                      end: start + from.length,
                      text: SWAPS[from] ?? '',
                    },
                  ],
                },
              ];
        }),
      ),
    }),
  };
}

function analyzeIn(root: string) {
  return () => {
    const lines = readFileSync(path.join(root, NAME), 'utf8').split('\n');
    const far = lines.some((line) => line.includes('FAR'))
      ? [
          {
            tool: 't',
            rule: 'unused',
            path: NAME,
            location: { line: 3 },
            classification: 'enforceable',
          },
        ]
      : [];
    return {
      findings: [
        ...far,
        ...lines.flatMap((line, index) =>
          [...line.matchAll(/FLAG:(\w+)\/([\w-]+)/gu)].map(([, tool = '', rule = '']) => ({
            tool,
            rule,
            path: NAME,
            location: { line: index + 1 },
            classification: 'enforceable',
          })),
        ),
      ],
    };
  };
}

function fixing(text: string, recipes: readonly RecipeSpec[]) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-narrow-'));
  roots.push(root);
  writeFileSync(path.join(root, NAME), text);
  const journal = createJournal(root);
  const fix = (): Journal => {
    runRecipes({
      projectRoot: root,
      files: [{ path: NAME }],
      recipes: defineRecipes(recipes),
      preset: 'java',
      selectedRules: undefined,
      accepts: () => true,
      writer: journalWriter(journal),
      inputs: undefined,
    });
    return journal;
  };
  return {
    fix,
    journal,
    analyze: analyzeIn(root),
    text: () => readFileSync(path.join(root, NAME), 'utf8'),
  };
}

const TEXT = 'head\nFLAG:t/first\nmiddle\n\n\nFLAG:t/second\n\n\nFLAG:t/third\ntail\n';
const ALL = [swapping('swap', ['FLAG:t/first', 'FLAG:t/second', 'FLAG:t/third'])];

describe('verifyFixes asked to narrow a rollback', () => {
  it('names the fix that added a finding, and the next run keeps the other fixes', () => {
    const { fix, journal, analyze, text } = fixing(TEXT, ALL);
    const first = verifyFixes({ journal: fix(), analyze, rollback: 'bad-fixes' });

    expect(text()).toBe(TEXT);
    expect(first.leftOut).toEqual([
      {
        tool: 't',
        rule: 'second',
        path: NAME,
        line: 6,
        lines: [[6, 6]],
        reason: 'adds t/worse in m.txt',
      },
    ]);
    expect(first.notes).toEqual([]);

    journal.leftOut = first.leftOut;
    const second = verifyFixes({ journal: fix(), analyze });

    expect(second.rolledBack).toEqual([]);
    expect(text()).toBe(
      TEXT.replace('FLAG:t/first', 'done-first').replace('FLAG:t/third', 'done-third'),
    );
  });

  it('names the fixes of a rule that is still reported, also from another recipe', () => {
    const recipes = [swapping('swap', ['FLAG:t/first']), swapping('other', ['FLAG:t/stuck'])];
    const { fix, analyze } = fixing('FLAG:t/first\n\n\nFLAG:t/stuck\n', recipes);
    const { leftOut, rolledBack } = verifyFixes({ journal: fix(), analyze, rollback: 'bad-fixes' });

    expect(rolledBack.map(({ recipe }) => recipe)).toEqual(['swap', 'other']);
    expect(leftOut.map(({ rule, line }) => [rule, line])).toEqual([['stuck', 4]]);
  });

  it.each([
    [
      'a finding lands on a line no fix edited',
      'FLAG:t/first\n\n\n\n\nFLAG:t/far\n',
      ['first', 'far'],
    ],
    ['every fix of the file is to blame', 'FLAG:t/second\n', ['second']],
  ])('rolls the file back whole when %s', (_case, before, rules) => {
    const { fix, analyze, text } = fixing(before, [
      swapping(
        'swap',
        rules.map((rule) => `FLAG:t/${rule}`),
      ),
    ]);
    const { leftOut, notes } = verifyFixes({ journal: fix(), analyze, rollback: 'bad-fixes' });

    expect(leftOut).toEqual([]);
    expect(notes.map((note) => note.slice(0, note.indexOf(':')))).toEqual([
      '--fix rolled back swap (m.txt)',
    ]);
    expect(text()).toBe(before);
  });

  it('rolls the file back whole when it is not asked to narrow', () => {
    const { fix, analyze } = fixing(TEXT, ALL);

    expect(verifyFixes({ journal: fix(), analyze }).leftOut).toEqual([]);
  });

  it('leaves a fix out by the lines it edits, not by the line it was reported on', () => {
    const { fix, journal, analyze, text } = fixing(TEXT, ALL);
    const first = verifyFixes({ journal: fix(), analyze, rollback: 'bad-fixes' });
    journal.leftOut = first.leftOut.map((left) => ({ ...left, line: 99 }));
    verifyFixes({ journal: fix(), analyze });

    expect(text()).toBe(
      TEXT.replace('FLAG:t/first', 'done-first').replace('FLAG:t/third', 'done-third'),
    );
  });
});
