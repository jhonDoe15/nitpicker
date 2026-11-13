import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { defineRecipes } from '../../../../../core/fix/engine/recipes.mjs';
import { runRecipes } from '../../../../../core/fix/engine/run-recipes.mjs';
import { parseUnifiedDiff } from '../patch/unified-diff.mjs';
import { ruleOf, SAFE_CHECKS } from '../checks/error-prone-checks.mjs';
import { errorProneRecipes } from './error-prone-recipes.mjs';

const roots = [];
const NAME = 'src/A.java';
const SOURCE = 'class A {\n  class Inner {}\n  void run() {}\n}\n';

function project() {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-ep-recipes-'));
  roots.push(root);
  mkdirSync(path.join(root, 'src'));
  writeFileSync(path.join(root, NAME), SOURCE);
  return root;
}

function entry(label, body, header) {
  return { label, hunk: parseUnifiedDiff(`--- a\n+++ a\n${header}\n${body}`)[0].hunks[0] };
}

const STATIC = entry(
  'ClassCanBeStatic',
  '-  class Inner {}\n+  static class Inner {}\n',
  '@@ -2,1 +2,1 @@',
);
const OVERRIDE = entry(
  'MissingOverride',
  '-  void run() {}\n+  @Override void run() {}\n',
  '@@ -3,1 +3,1 @@',
);

function run(root, entries, selectedRules = []) {
  return runRecipes({
    projectRoot: root,
    files: [{ path: NAME }],
    recipes: defineRecipes(errorProneRecipes(new Map([[NAME, entries]]))),
    preset: 'java',
    selectedRules,
    accepts: () => true,
  });
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('the Error Prone recipes', () => {
  it('apply safe checks by default and leave review checks alone', () => {
    const root = project();

    const result = run(root, [STATIC, OVERRIDE]);

    expect(readFileSync(path.join(root, NAME), 'utf8')).toBe(
      'class A {\n  class Inner {}\n  @Override void run() {}\n}\n',
    );
    expect(result.fixedFindings).toEqual([
      `${NAME}:3 errorprone/MissingOverride (java-error-prone-safe)`,
    ]);
    expect(result.toolErrors).toEqual([]);
  });

  it('apply a review check when its rule is selected, and only the selected rule', () => {
    const root = project();

    const result = run(root, [STATIC, OVERRIDE], ['errorprone/ClassCanBeStatic']);

    expect(readFileSync(path.join(root, NAME), 'utf8')).toBe(
      'class A {\n  static class Inner {}\n  void run() {}\n}\n',
    );
    expect(result.fixedFindings).toEqual([
      `${NAME}:2 errorprone/ClassCanBeStatic (java-error-prone-review)`,
    ]);
  });

  it('apply both fixes of a file in one run and never twice', () => {
    const root = project();

    const result = run(
      root,
      [STATIC, OVERRIDE],
      ['errorprone/ClassCanBeStatic', 'errorprone/MissingOverride'],
    );

    expect(readFileSync(path.join(root, NAME), 'utf8')).toBe(
      'class A {\n  static class Inner {}\n  @Override void run() {}\n}\n',
    );
    expect(result.fixedFindings).toHaveLength(2);
    expect(result.notes).toEqual([]);
  });

  it('plan nothing for a file the patch does not mention', () => {
    const root = project();

    const result = runRecipes({
      projectRoot: root,
      files: [{ path: NAME }],
      recipes: defineRecipes(errorProneRecipes(new Map())),
      preset: 'java',
      accepts: () => true,
    });

    expect(result.fixedFindings).toEqual([]);
    expect(readFileSync(path.join(root, NAME), 'utf8')).toBe(SOURCE);
  });

  it('map a hunk of an own check to the finding of the rule it fixes', () => {
    const root = project();
    const swap = entry(
      'UseStandardCharsets',
      '-  void run() {}\n+  void run() { }\n',
      '@@ -3,1 +3,1 @@',
    );

    const result = run(root, [swap]);

    expect(result.fixedFindings).toEqual([`${NAME}:3 pmd/UseStandardCharsets (java-source-safe)`]);
  });

  it('keep the review own checks for the run that selects their rule', () => {
    const root = project();
    const retry = entry('RetryInTest', '-  void run() {}\n+  void run() { }\n', '@@ -3,1 +3,1 @@');

    const plain = run(root, [retry]);
    const selected = run(root, [retry], ['pmd/RetryInTest']);

    expect(plain.fixedFindings).toEqual([]);
    expect(selected.fixedFindings).toEqual([`${NAME}:3 pmd/RetryInTest (java-source-review)`]);
  });

  it('cover the java and kotlin presets', () => {
    const [safe, review, ownSafe, ownReview] = errorProneRecipes(new Map());

    expect(safe.presets).toEqual(['java', 'kotlin']);
    expect([safe.safety, review.safety]).toEqual(['safe', 'review']);
    expect(safe.rules).toEqual(SAFE_CHECKS.map(ruleOf));
    expect([ownSafe, ownReview].map(({ presets }) => presets)).toEqual([
      ['java', 'kotlin'],
      ['java', 'kotlin'],
    ]);
    expect([ownSafe.safety, ownReview.safety]).toEqual(['safe', 'review']);
  });
});
