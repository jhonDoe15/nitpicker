import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { useGitFixtures } from '../../diff/git/test-support/git-repository.mjs';
import { writeFiles } from '../../diff/git/test-support/fixture-files.mjs';
import { defineRecipes } from './recipes.mjs';
import { MAX_PASSES, runRecipes } from './run-recipes.mjs';

const { temporaryRoot } = useGitFixtures();

const RULE = { tool: 'demo', rule: 'shout' };

function recipe(overrides) {
  return {
    id: 'demo',
    rules: [RULE],
    presets: ['java'],
    scope: 'file',
    safety: 'safe',
    ...overrides,
  };
}

function wordFixes(word, replacement, { files }) {
  return {
    fixes: files.flatMap(({ path: name, text }) => {
      const start = text.indexOf(word);
      return start === -1
        ? []
        : [
            {
              finding: { ...RULE, path: name, line: 1 },
              edits: [
                { type: 'replace', path: name, start, end: start + word.length, text: replacement },
              ],
            },
          ];
    }),
  };
}

const shout = recipe({ plan: (context) => wordFixes('quiet', 'LOUD', context) });

function project(files) {
  const root = temporaryRoot('nitpicker-recipes-');
  writeFiles(root, files);
  return root;
}

function run(root, recipes, options = {}) {
  return runRecipes({
    projectRoot: root,
    files: Object.keys(options.changed ?? { 'a.txt': true }).map((name) => ({ path: name })),
    recipes: defineRecipes(recipes),
    preset: 'java',
    accepts: () => true,
    ...options,
  });
}

function read(root, name) {
  return readFileSync(path.join(root, name), 'utf8');
}

describe('runRecipes', () => {
  it('applies every fix a safe recipe plans, pass after pass, and lists the findings', () => {
    const root = project({ 'a.txt': 'quiet quiet\n' });

    const result = run(root, [shout]);

    expect(read(root, 'a.txt')).toBe('LOUD LOUD\n');
    expect(result).toEqual({
      fixedFindings: ['a.txt:1 demo/shout (demo)', 'a.txt:1 demo/shout (demo)'],
      files: [{ path: 'a.txt' }],
      toolErrors: [],
      notes: [],
    });
  });
  it('runs a review recipe only when one of its rules is selected, and then only those fixes', () => {
    const root = project({ 'a.txt': 'quiet\n' });
    const review = recipe({ safety: 'review', plan: shout.plan });

    expect(run(root, [review]).fixedFindings).toEqual([]);
    expect(read(root, 'a.txt')).toBe('quiet\n');
    expect(run(root, [review], { selectedRules: ['demo/other'] }).fixedFindings).toEqual([]);
    expect(run(root, [review], { selectedRules: ['demo/shout'] }).fixedFindings).toHaveLength(1);
    expect(read(root, 'a.txt')).toBe('LOUD\n');
  });
  it('skips recipes of other presets', () => {
    const root = project({ 'a.txt': 'quiet\n' });

    expect(run(root, [recipe({ presets: ['kotlin'], plan: shout.plan })]).fixedFindings).toEqual(
      [],
    );
  });
  it('skips the later of two overlapping fixes and lets the next pass plan it on the new text', () => {
    const root = project({ 'a.txt': 'quiet\n' });
    const whisper = recipe({
      id: 'whisper',
      plan: (context) => wordFixes('LOUD', 'hush', context),
    });

    const result = run(root, [
      shout,
      recipe({ id: 'mute', plan: (context) => wordFixes('quiet', '', context) }),
      whisper,
    ]);

    expect(read(root, 'a.txt')).toBe('hush\n');
    expect(result.fixedFindings).toEqual([
      'a.txt:1 demo/shout (demo)',
      'a.txt:1 demo/shout (whisper)',
    ]);
    expect(result.notes).toEqual([]);
  });
  it(`stops after ${MAX_PASSES} passes and names the fixes it did not get to`, () => {
    const root = project({ 'a.txt': 'x' });
    const grow = recipe({
      plan: ({ files }) => ({
        fixes: files.map(({ path: name, text }) => ({
          finding: { ...RULE, path: name, line: 1 },
          edits: [{ type: 'replace', path: name, start: text.length, end: text.length, text: 'x' }],
        })),
      }),
    });

    const result = run(root, [grow]);

    expect(read(root, 'a.txt')).toBe('x'.repeat(MAX_PASSES + 1));
    expect(result.fixedFindings).toHaveLength(MAX_PASSES);
    expect(result.notes).toEqual([
      `--fix left a.txt:1 demo/shout (demo) for a later run: ${MAX_PASSES} passes did not get to it`,
    ]);
  });
  it('leaves a file that changed after the plan read it, and says so', () => {
    const root = project({ 'a.txt': 'quiet\n' });
    const racing = recipe({
      plan: (context) => {
        const planned = wordFixes('quiet', 'LOUD', context);
        writeFileSync(path.join(root, 'a.txt'), 'quiet, edited\n');
        return planned;
      },
    });

    const result = run(root, [racing]);

    expect(read(root, 'a.txt')).toBe('quiet, edited\n');
    expect(result.fixedFindings).toEqual([]);
    expect(result.notes).toEqual(['--fix left a.txt as is: the file changed while --fix ran']);
  });
  it('turns a recipe that edits outside the project or an unchanged file into a tool error', () => {
    const root = project({ 'a.txt': 'quiet\n', 'b.txt': 'quiet\n' });
    const outside = recipe({
      id: 'outside',
      plan: () => ({
        fixes: [
          {
            finding: { ...RULE, path: 'a.txt', line: 1 },
            edits: [{ type: 'write', path: '../escape.txt', text: 'x' }],
          },
        ],
      }),
    });
    const unchanged = recipe({
      id: 'unchanged',
      plan: ({ read: readFile }) =>
        wordFixes('quiet', 'LOUD', { files: [{ path: 'b.txt', text: readFile('b.txt') }] }),
    });

    const result = run(root, [outside, unchanged, recipe({ id: 'kept', plan: shout.plan })]);

    expect(result.toolErrors).toEqual([
      expect.objectContaining({
        tool: 'fix-recipe outside',
        snapshot: 'fix',
        message: expect.stringMatching(/outside/u),
      }),
      expect.objectContaining({
        tool: 'fix-recipe unchanged',
        message: 'b.txt is not a changed file',
      }),
    ]);
    expect(existsSync(path.join(root, '..', 'escape.txt'))).toBe(false);
    expect([read(root, 'a.txt'), read(root, 'b.txt')]).toEqual(['LOUD\n', 'quiet\n']);
  });
  it('lets a project recipe edit a file it read, and refuses files --fix does not cover', () => {
    const root = project({ 'a.txt': 'quiet\n', 'b.txt': 'quiet\n', 'skip.txt': 'quiet\n' });
    const wide = recipe({
      scope: 'project',
      plan: ({ read: readFile }) =>
        wordFixes('quiet', 'LOUD', {
          files: ['b.txt', 'skip.txt'].map((name) => ({ path: name, text: readFile(name) })),
        }),
    });

    const result = run(root, [wide], { accepts: (name) => name !== 'skip.txt' });

    expect(result.toolErrors.map(({ message }) => message)).toEqual([
      'skip.txt is outside the files --fix covers',
    ]);
    expect(read(root, 'b.txt')).toBe('quiet\n');
    const narrow = recipe({
      scope: 'project',
      plan: ({ read: readFile }) =>
        wordFixes('quiet', 'LOUD', { files: [{ path: 'b.txt', text: readFile('b.txt') }] }),
    });
    expect(run(root, [narrow]).fixedFindings).toEqual(['b.txt:1 demo/shout (demo)']);
    expect(read(root, 'b.txt')).toBe('LOUD\n');
  });
  it('turns a throwing recipe into a tool error and still applies the others', () => {
    const root = project({ 'a.txt': 'quiet\n' });
    const broken = recipe({
      id: 'broken',
      plan: () => {
        throw new Error('parse failed');
      },
    });

    const result = run(root, [broken, recipe({ id: 'kept', plan: shout.plan })]);

    expect(result.toolErrors).toEqual([
      { tool: 'fix-recipe broken', snapshot: 'fix', message: 'parse failed' },
    ]);
    expect(read(root, 'a.txt')).toBe('LOUD\n');
  });
  it('moves, deletes and creates files, and follows a moved file into the next pass', () => {
    const root = project({ 'a.txt': 'quiet\n', 'old.txt': 'gone\n' });
    const reshape = recipe({
      scope: 'project',
      plan: ({ files }) => ({
        fixes: files
          .filter(({ path: name }) => name === 'a.txt')
          .flatMap(() => [
            {
              finding: { ...RULE, path: 'a.txt', line: 1 },
              edits: [{ type: 'move', from: 'a.txt', to: 'dir/b.txt' }],
            },
            {
              finding: { ...RULE, path: 'old.txt', line: 1 },
              edits: [{ type: 'delete', path: 'old.txt' }],
            },
            {
              finding: { ...RULE, path: 'new.txt', line: 1 },
              edits: [{ type: 'write', path: 'new.txt', text: 'n\n' }],
            },
          ]),
      }),
    });

    const result = run(root, [reshape, recipe({ id: 'then', plan: shout.plan })], {
      changed: { 'a.txt': true, 'old.txt': true },
    });

    expect([existsSync(path.join(root, 'a.txt')), existsSync(path.join(root, 'old.txt'))]).toEqual([
      false,
      false,
    ]);
    expect([read(root, 'dir/b.txt'), read(root, 'new.txt')]).toEqual(['LOUD\n', 'n\n']);
    expect(result.files).toEqual([{ path: 'dir/b.txt' }, { path: 'old.txt' }]);
    expect(result.fixedFindings).toHaveLength(4);
  });
});
