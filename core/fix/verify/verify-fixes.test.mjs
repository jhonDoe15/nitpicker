import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fixtureGit, useGitFixtures } from '../../diff/git/test-support/git-repository.mjs';
import { createJournal, journalWriter } from '../dry-run/journal.mjs';
import { createSnapshot } from '../engine/edits/snapshot.mjs';
import { defineRecipes } from '../engine/recipes.mjs';
import { runRecipes } from '../engine/run-recipes.mjs';
import { verifyFixes } from './verify-fixes.mjs';

const roots = [];
const { createGitRepository } = useGitFixtures();

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function replacing(id, rule, from, to, names) {
  return {
    id,
    rules: [{ tool: 't', rule }],
    presets: ['java'],
    scope: 'file',
    safety: 'safe',
    plan: ({ files }) => ({
      fixes: files
        .filter(({ path: name, text }) => names.includes(name) && text.includes(from))
        .map(({ path: name, text }) => ({
          finding: { tool: 't', rule, path: name, line: 1 },
          edits: [
            {
              type: 'replace',
              path: name,
              start: text.indexOf(from),
              end: text.indexOf(from) + from.length,
              text: to,
            },
          ],
        })),
    }),
  };
}

function project(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-verify-'));
  roots.push(root);
  for (const [name, text] of Object.entries(files)) {
    writeFileSync(path.join(root, name), text);
  }
  return root;
}

function read(root, name) {
  return readFileSync(path.join(root, name), 'utf8');
}

function analyzeTree(root) {
  return vi.fn(() => {
    const names = ['a.txt', 'b.txt', 'c.txt', 'd.txt', 'e.txt', 'f.txt', 'g.txt'];
    const findings = names.flatMap((name) => {
      const text = readFileSync(path.join(root, name), 'utf8');
      const flags = [...text.matchAll(/FLAG:(\w+)\/([\w-]+)/gu)].map(([, tool, rule]) => ({
        tool,
        rule,
        path: name,
        classification: 'enforceable',
      }));
      return text.includes('BREAK_G')
        ? [
            ...flags,
            { tool: 'build', rule: 'compile-error', path: 'g.txt', classification: 'enforceable' },
          ]
        : flags;
    });
    return { findings };
  });
}

const FILES = {
  'a.txt': 'FLAG:t/a\n',
  'b.txt': 'FLAG:t/b\n',
  'c.txt': 'FLAG:t/c\n',
  'd.txt': 'x FLAG:t/d\n',
  'e.txt': 'FLAG:t/e\n',
  'f.txt': 'FLAG:t/f\n',
  'g.txt': 'fine\n',
};

function runAll(root, recipes) {
  const journal = createJournal(root);
  runRecipes({
    projectRoot: root,
    files: Object.keys(FILES).map((name) => ({ path: name })),
    recipes: defineRecipes(recipes),
    preset: 'java',
    accepts: () => true,
    writer: journalWriter(journal),
  });
  return journal;
}

const RECIPES = [
  replacing('good', 'a', 'FLAG:t/a', 'ok', ['a.txt']),
  replacing('adds', 'b', 'FLAG:t/b', 'FLAG:t/new', ['b.txt']),
  replacing('breaks', 'c', 'FLAG:t/c', 'FLAG:build/compile-error', ['c.txt']),
  replacing('stays', 'd', 'x ', 'y ', ['d.txt']),
  replacing('also-good', 'e', 'FLAG:t/e', 'fine', ['e.txt']),
];

describe('verifyFixes', () => {
  it('rolls back the recipes that make things worse and keeps the others', () => {
    const root = project(FILES);
    const journal = runAll(root, RECIPES);
    const analyze = analyzeTree(root);
    const { rolledBack, notes } = verifyFixes({ journal, analyze });
    expect(rolledBack.map(({ recipe }) => recipe)).toEqual(['adds', 'breaks', 'stays']);
    expect(Object.fromEntries(Object.keys(FILES).map((name) => [name, read(root, name)]))).toEqual({
      ...FILES,
      'a.txt': 'ok\n',
      'e.txt': 'fine\n',
    });
    expect(notes).toEqual([
      '--fix rolled back adds (b.txt): adds t/new in b.txt',
      '--fix rolled back breaks (c.txt): breaks the compile or type check: new build/compile-error in c.txt',
      '--fix rolled back stays (d.txt): t/d is still reported in d.txt',
    ]);
    expect(journal.events.map(({ recipe }) => recipe)).toEqual(['good', 'also-good']);
  });

  it('leaves the verified tree as the fixes made it, even though the baseline run reverts it', () => {
    const root = project(FILES);
    const journal = runAll(root, [RECIPES[0]]);
    const seen = [];
    verifyFixes({
      journal,
      analyze: (request) => {
        seen.push(read(root, 'a.txt'));
        return { findings: [], request };
      },
    });
    expect(seen).toEqual(['ok\n', 'FLAG:t/a\n']);
    expect(read(root, 'a.txt')).toBe('ok\n');
  });

  it('rolls back every recipe when the build breaks in a file none of them touched', () => {
    const root = project(FILES);
    const journal = runAll(root, [
      replacing('good', 'a', 'FLAG:t/a', 'ok', ['a.txt']),
      replacing('culprit', 'f', 'FLAG:t/f', 'BREAK_G', ['f.txt']),
    ]);
    const { rolledBack } = verifyFixes({ journal, analyze: analyzeTree(root) });
    expect(rolledBack.map(({ recipe }) => recipe)).toEqual(['good', 'culprit']);
    expect(read(root, 'a.txt')).toBe(FILES['a.txt']);
    expect(read(root, 'f.txt')).toBe(FILES['f.txt']);
  });

  it('rolls back every recipe that touched a file that broke', () => {
    const root = project({ ...FILES, 'a.txt': 'FLAG:t/a FLAG:t/b\n' });
    const journal = runAll(root, [
      replacing('first', 'a', 'FLAG:t/a', 'FLAG:t/new', ['a.txt']),
      replacing('second', 'b', 'FLAG:t/b', 'ok', ['a.txt']),
    ]);
    const { rolledBack } = verifyFixes({ journal, analyze: analyzeTree(root) });
    expect(rolledBack.map(({ recipe }) => recipe)).toEqual(['first', 'second']);
    expect(read(root, 'a.txt')).toBe('FLAG:t/a FLAG:t/b\n');
  });

  it('does not run an analyzer when no recipe fixed anything', () => {
    const root = project(FILES);
    const analyze = analyzeTree(root);
    const result = verifyFixes({ journal: createJournal(root), analyze });
    expect(result).toEqual({ rolledBack: [], notes: [] });
    expect(analyze).not.toHaveBeenCalled();
  });

  it('keeps every fix and says so when the analyzers fail', () => {
    const root = project(FILES);
    const journal = runAll(root, [RECIPES[1]]);
    const { rolledBack, notes } = verifyFixes({
      journal,
      analyze: () => ({ findings: [], errors: ['java: boom'] }),
    });
    expect(rolledBack).toEqual([]);
    expect(notes).toEqual(['--fix could not verify the fixes: java: boom']);
    expect(read(root, 'b.txt')).toBe('FLAG:t/new\n');
  });

  it('keeps every fix when the analysis throws', () => {
    const root = project(FILES);
    const journal = runAll(root, [RECIPES[0]]);
    const analyze = () => {
      throw new Error('no analyzer reports the fixed rules');
    };
    expect(verifyFixes({ journal, analyze }).notes).toEqual([
      '--fix could not verify the fixes: no analyzer reports the fixed rules',
    ]);
    expect(read(root, 'a.txt')).toBe('ok\n');
  });

  it('names the tools that no analyzer reports', () => {
    const root = project(FILES);
    const journal = runAll(root, [RECIPES[0]]);
    const { notes } = verifyFixes({
      journal,
      analyze: () => ({ findings: [], unmatched: ['t'] }),
    });
    expect(notes).toEqual(['--fix could not verify t: no analyzer reports it']);
  });

  it('asks the analyzers for the fixed tools and the touched files', () => {
    const root = project(FILES);
    const journal = runAll(root, [RECIPES[0]]);
    const analyze = vi.fn(() => ({ findings: [] }));
    verifyFixes({ journal, analyze, mode: 'full' });
    expect(analyze).toHaveBeenCalledWith({ tools: ['t'], files: ['a.txt'], mode: 'full' });
  });

  it('puts a path back into the git index when it rolls back a recipe that untracked it', () => {
    const { root } = createGitRepository({ '.env': 'A=1\n', 'a.txt': 'a\n' });
    const journal = createJournal(root);
    const finding = { tool: 't', rule: 'x', path: '.env', line: 1 };
    const entries = [
      {
        recipe: 'untrack',
        safety: 'review',
        fix: { finding, edits: [{ type: 'untrack', path: '.env' }] },
      },
    ];
    journalWriter(journal).apply(createSnapshot(root, ['.env']), entries);
    const worse = { tool: 't', rule: 'new', path: '.env', classification: 'enforceable' };
    const analyze = vi
      .fn()
      .mockReturnValueOnce({ findings: [worse] })
      .mockReturnValue({ findings: [] });

    const { rolledBack } = verifyFixes({ journal, analyze });

    expect(rolledBack.map(({ recipe }) => recipe)).toEqual(['untrack']);
    expect(fixtureGit(root, ['ls-files'])).toBe('.env\na.txt\n');
  });

  it('keeps a recipe whose file the user edited meanwhile and says so', () => {
    const root = project(FILES);
    const journal = runAll(root, [RECIPES[1]]);
    writeFileSync(path.join(root, 'b.txt'), 'FLAG:t/new\nmine\n');

    const { rolledBack, notes } = verifyFixes({ journal, analyze: analyzeTree(root) });

    expect(rolledBack).toEqual([]);
    expect(notes).toEqual([
      '--fix could not roll back adds (b.txt): a file changed while --fix ran, left as is',
    ]);
    expect(read(root, 'b.txt')).toBe('FLAG:t/new\nmine\n');
    expect(journal.events).toHaveLength(1);
  });
});
