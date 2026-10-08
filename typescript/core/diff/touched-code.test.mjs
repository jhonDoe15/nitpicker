import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { isStrictRule } from '../../preset/strict-rules.mjs';
import { compareFindings } from './compare.mjs';
import { parseChangedLines, readChangedLines } from './git.mjs';

const temporaryRoots = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function finding(overrides = {}) {
  return {
    tool: 'eslint-lint',
    rule: 'no-restricted-syntax',
    path: 'src/main/a.ts',
    identity: 'message:x|node:TSAsExpression|syntax:1',
    message: 'Do not assert with `as`.',
    classification: 'enforceable',
    location: { line: 10, column: 1 },
    ...overrides,
  };
}

function touched(changed) {
  return { changedLines: new Map(Object.entries(changed)), isStrictRule };
}

describe('changed line ranges', () => {
  const diff = [
    'diff --git a/src/main/a.ts b/src/main/a.ts',
    'index 1..2 100644',
    '--- a/src/main/a.ts',
    '+++ b/src/main/a.ts',
    '@@ -3,0 +4,2 @@ context',
    '+one',
    '+two',
    '@@ -20,2 +22 @@',
    '-old',
    '+new',
    '@@ -30,3 +31,0 @@',
    '-removed',
    'diff --git a/src/main/b.ts b/src/main/b.ts',
    'new file mode 100644',
    'index 0..3',
    '--- /dev/null',
    '+++ b/src/main/b.ts',
    '@@ -0,0 +1,4 @@',
    'diff --git a/src/main/gone.ts b/src/main/gone.ts',
    'deleted file mode 100644',
    '--- a/src/main/gone.ts',
    '+++ /dev/null',
    '@@ -1,2 +0,0 @@',
    'diff --git a/src/main/with space.ts b/src/main/with space.ts',
    '--- a/src/main/with space.ts',
    '+++ b/src/main/with space.ts\t',
    '@@ -1 +1 @@',
  ].join('\n');

  it('reads head-side ranges, new files and spaced names, and skips pure deletions', () => {
    const changed = parseChangedLines(diff);

    expect(changed.get('src/main/a.ts')).toMatchObject({
      added: false,
      ranges: [
        [4, 5],
        [22, 22],
      ],
    });
    expect(changed.get('src/main/b.ts')).toMatchObject({ added: true, ranges: [[1, 4]] });
    expect(changed.has('src/main/gone.ts')).toBe(false);
    expect(changed.get('src/main/with space.ts')).toMatchObject({ ranges: [[1, 1]] });
  });

  it('makes paths relative to the project inside the repository', () => {
    const changed = parseChangedLines(diff, 'src');

    expect([...changed.keys()]).toContain('main/a.ts');
  });

  it('reads real git output, including a content-preserving rename', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-touched-'));
    temporaryRoots.push(root);
    const run = (...args) =>
      execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', ...args], {
        cwd: root,
        encoding: 'utf8',
      }).trim();
    run('init', '-q', '-b', 'main');
    mkdirSync(path.join(root, 'src'));
    const lines = Array.from(
      { length: 12 },
      (_, index) => `export const v${String(index)} = ${String(index)};`,
    );
    writeFileSync(path.join(root, 'src/a.ts'), `${lines.join('\n')}\n`);
    writeFileSync(path.join(root, 'src/moved.ts'), `${lines.join('\n')}\nexport const m = 1;\n`);
    run('add', '.');
    run('commit', '-q', '-m', 'base');
    const mergeBaseSha = run('rev-parse', 'HEAD');
    writeFileSync(
      path.join(root, 'src/a.ts'),
      `${lines.map((line, index) => (index === 5 ? 'export const changed = 1;' : line)).join('\n')}\n`,
    );
    run('mv', 'src/moved.ts', 'src/renamed.ts');
    writeFileSync(path.join(root, 'src/fresh.ts'), 'export const fresh = 1;\n');
    run('add', '.');
    run('commit', '-q', '-m', 'head');

    const changed = readChangedLines({
      repositoryRoot: root,
      mergeBaseSha,
      headSha: run('rev-parse', 'HEAD'),
      projectRelativePath: '.',
    });

    expect(changed.get('src/a.ts')).toMatchObject({ added: false, ranges: [[6, 6]] });
    expect(changed.get('src/fresh.ts')).toMatchObject({ added: true });
    expect(changed.has('src/renamed.ts')).toBe(false);
    expect(changed.has('src/moved.ts')).toBe(false);
  });
});

describe('strict rules in touched code', () => {
  const base = [finding()];
  const head = [finding({ location: { line: 12, column: 1 } })];

  it('knows the strict rules', () => {
    expect(isStrictRule('no-restricted-syntax')).toBe(true);
    expect(isStrictRule('nitpicker/no-comments')).toBe(true);
    expect(isStrictRule('domain-does-not-import-adapters')).toBe(true);
    expect(isStrictRule('prettier/prettier')).toBe(false);
    expect(isStrictRule('sonarjs/cognitive-complexity')).toBe(false);
  });

  it('keeps an existing finding baselined when the file is untouched', () => {
    const result = compareFindings({
      baseFindings: base,
      headFindings: head,
      touchedCode: touched({}),
    });

    expect(result.newFindings).toEqual([]);
    expect(result.unchangedFindings).toHaveLength(1);
  });

  it('keeps an existing finding baselined when the edit is elsewhere in the file', () => {
    const changed = { 'src/main/a.ts': { added: false, ranges: [[1, 3]] } };
    const result = compareFindings({
      baseFindings: base,
      headFindings: head,
      touchedCode: touched(changed),
    });

    expect(result.newFindings).toEqual([]);
  });

  it('makes an existing finding new when its line is in a changed range', () => {
    const changed = { 'src/main/a.ts': { added: false, ranges: [[11, 13]] } };
    const result = compareFindings({
      baseFindings: base,
      headFindings: head,
      touchedCode: touched(changed),
    });

    expect(result.newFindings).toEqual(head);
    expect(result.unchangedFindings).toEqual([]);
    expect(result.resolvedFindings).toEqual([]);
  });

  it('treats every finding of a newly added file as touched, with or without a location', () => {
    const noLocation = finding({ location: undefined, identity: 'other' });
    const changed = { 'src/main/a.ts': { added: true, ranges: [] } };
    const result = compareFindings({
      baseFindings: [...base, noLocation],
      headFindings: [...head, noLocation],
      touchedCode: touched(changed),
    });

    expect(result.newFindings).toHaveLength(2);
  });

  it('keeps a location-less finding baselined in a merely edited file', () => {
    const noLocation = finding({ location: undefined, identity: 'other' });
    const changed = { 'src/main/a.ts': { added: false, ranges: [[1, 100]] } };
    const result = compareFindings({
      baseFindings: [noLocation],
      headFindings: [noLocation],
      touchedCode: touched(changed),
    });

    expect(result.newFindings).toEqual([]);
  });

  it('does not promote findings of rules outside the strict set', () => {
    const other = finding({ rule: 'sonarjs/cognitive-complexity' });
    const changed = { 'src/main/a.ts': { added: false, ranges: [[1, 100]] } };
    const result = compareFindings({
      baseFindings: [other],
      headFindings: [other],
      touchedCode: touched(changed),
    });

    expect(result.newFindings).toEqual([]);
  });

  it('does not promote descriptive metrics', () => {
    const metric = finding({
      rule: 'no-restricted-syntax',
      classification: 'descriptive',
      metric: { name: 'm', value: 1 },
    });
    const changed = { 'src/main/a.ts': { added: false, ranges: [[1, 100]] } };
    const result = compareFindings({
      baseFindings: [metric],
      headFindings: [metric],
      touchedCode: touched(changed),
    });

    expect(result.newFindings).toEqual([]);
  });

  it('compares as before without touched-code information', () => {
    const result = compareFindings({ baseFindings: base, headFindings: head });

    expect(result.unchangedFindings).toHaveLength(1);
  });
});
