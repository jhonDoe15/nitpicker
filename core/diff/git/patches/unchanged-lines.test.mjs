import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  commit,
  copyGitTemplate,
  createGitTemplate,
  fixtureGit,
} from '../test-support/git-repository.mjs';
import { parseChangedLines, readChangedLines } from './changed-lines.mjs';
import { baseLineOf, headLineOf } from './unchanged-lines.mjs';

function fileDiff(filePath, hunks) {
  return [
    `diff --git a/${filePath} b/${filePath}`,
    `--- a/${filePath}`,
    `+++ b/${filePath}`,
    ...hunks.flat(),
  ].join('\n');
}

function pick(file, names) {
  return Object.fromEntries(names.map((name) => [name, file[name]]));
}

function changedIn(filePath, hunks) {
  return parseChangedLines(fileDiff(filePath, hunks)).get(filePath);
}

describe('lines whose only change is formatting', () => {
  it('counts a quote and spacing restyle of a Python line as unchanged', () => {
    const file = changedIn('src/greet.py', [
      ['@@ -2,2 +2,2 @@', "-    print('hello ' + name)", "-    print( 'bye ' + name )"],
      ['+    print("hello " + name)', '+    print("bye " + name)'],
    ]);

    expect(pick(file, ['ranges', 'inserted', 'carried'])).toEqual({
      ranges: [],
      inserted: [],
      carried: [
        [2, 2],
        [3, 3],
      ],
    });
  });

  it('counts joined, split and moved lines, trailing commas, semicolons and arrow parentheses as unchanged', () => {
    const file = changedIn('src/list.ts', [
      ['@@ -4,4 +4,3 @@', '-const total = sum(', '-  first,', '-  second,', '-);'],
      ['+const total = sum(first, second)', '+export const twice = (value) =>', '+  value * 2'],
      ['@@ -9 +8 @@', '-export const twice = value => value * 2;'],
      ['+export const done = true'],
    ]);

    expect(pick(file, ['ranges', 'inserted'])).toEqual({ ranges: [[8, 8]], inserted: [[8, 8]] });
  });

  it('keeps a changed quote style meaningful where the formatter never changes it', () => {
    const file = changedIn('src/Main.java', [
      ['@@ -3 +3 @@', "-    char c = 'a';", '+    char c = "a";'],
    ]);

    expect(file.ranges).toEqual([[3, 3]]);
  });

  it('counts a line that lost part of its code as edited', () => {
    const file = changedIn('src/a.py', [['@@ -5 +5 @@', '-    run(a, b)', '+    run(a)']]);

    expect(file.ranges).toEqual([[5, 5]]);
  });

  it('counts a line with a new token as edited, next to reformatted lines in the same hunk', () => {
    const file = changedIn('src/a.py', [
      ['@@ -1,3 +1,3 @@', "-x = 'a'", "-y = 'b'", "-z = 'c'"],
      ['+x = "a"', '+y = "b2"', '+z = "c"'],
    ]);

    expect(pick(file, ['ranges', 'carried'])).toEqual({
      ranges: [[2, 2]],
      carried: [
        [1, 1],
        [3, 3],
      ],
    });
  });

  it('falls back to every added line when the hunks differ too much to align', () => {
    const removed = Array.from({ length: 700 }, (_, index) => `-a${String(index)} = 1`);
    const added = Array.from({ length: 700 }, (_, index) => `+b${String(index)} = 2`);
    const file = changedIn('src/a.py', [['@@ -1,700 +1,700 @@', ...removed, ...added]]);

    expect(pick(file, ['ranges', 'carried'])).toEqual({ ranges: [[1, 700]], carried: [] });
  });
});

describe('lines that moved within a file', () => {
  const extraction = fileDiff('src/proc.py', [
    ['@@ -1,2 +1 @@', '-def process(items):', '-    print("start")', '+def summed(items):'],
    ['@@ -5,0 +5,6 @@', '+    return total', '+', '+', '+def process(items):'],
    ['+    print("start")', '+    total = summed(items)'],
  ]);

  it('counts a legacy function header pushed down by a helper inserted above it as unchanged', () => {
    const file = parseChangedLines(extraction).get('src/proc.py');

    expect(pick(file, ['ranges', 'carried'])).toEqual({
      ranges: [
        [1, 1],
        [5, 5],
        [10, 10],
      ],
      carried: [
        [8, 1],
        [9, 2],
      ],
    });
  });

  it('maps a head line to its base line, around hunks and through moved lines', () => {
    const file = parseChangedLines(extraction).get('src/proc.py');

    expect([2, 3, 4, 9, 10, 11].map((line) => baseLineOf(file, line))).toEqual([
      3,
      4,
      5,
      2,
      undefined,
      6,
    ]);
    expect([1, 3, 6].map((line) => headLineOf(file, line))).toEqual([8, 2, 11]);
  });

  it('maps lines one to one in a file the change left alone', () => {
    expect(baseLineOf(undefined, 7)).toBe(7);
    expect(headLineOf(undefined, 7)).toBe(7);
  });
});

describe('changed lines read from git', () => {
  const lines = (...text) => `${text.join('\n')}\n`;
  const gitTemplate = createGitTemplate();
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-unchanged-lines-'));
  const shas = {};
  const sum = ['  let total = 0;', '  for (const item of items) total += item;', '  return total;'];

  beforeAll(() => {
    copyGitTemplate(gitTemplate, root);
    writeFileSync(
      path.join(root, 'load.ts'),
      lines('function load(items) {', "  console.log('start');", ...sum, '}'),
    );
    commit(root, 'base');
    shas.base = fixtureGit(root, ['rev-parse', 'HEAD']).trim();
    writeFileSync(
      path.join(root, 'load.ts'),
      lines(
        ...['function sum(items) {', ...sum, '}', ''],
        ...['function load(items) {', '  console.log("start");', '  return sum(items);', '}'],
      ),
    );
    commit(root, 'head');
    shas.head = fixtureGit(root, ['rev-parse', 'HEAD']).trim();
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('keeps the first lines of a function unchanged when a block of it moves to a helper above it', () => {
    const { ranges } = readChangedLines({
      repositoryRoot: root,
      mergeBaseSha: shas.base,
      headSha: shas.head,
      projectRelativePath: '.',
    }).get('load.ts');
    const isChanged = (line) => ranges.some(([start, end]) => start <= line && line <= end);

    expect([1, 7, 8, 9].map(isChanged)).toEqual([true, false, false, true]);
  });
});
