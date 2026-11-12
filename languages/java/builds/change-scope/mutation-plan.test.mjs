import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  fixtureGit,
  useGitFixtures,
} from '../../../../core/diff/git/test-support/git-repository.mjs';
import { comparisonMutationPlan, mutationPlanOf } from './mutation-plan.mjs';
import { isJvmTestPath } from './jvm-paths.mjs';
import { changedTestsKey } from './tested-sources.mjs';

const MAIN = 'src/main/java/shop';
const TEST = 'src/test/java/shop';
const PRICE = [
  'package shop;',
  '',
  'public class Price {',
  '  public int total(int count) {',
  '    return count * 2;',
  '  }',
  '}',
  '',
].join('\n');
const PRICE_TEST = [
  'package shop;',
  '',
  'import shop.money.Money;',
  '',
  'class PriceTest {',
  '  void totals() {',
  '    new Price().total(Money.ONE);',
  '  }',
  '}',
  '',
].join('\n');

const { createGitRepository } = useGitFixtures();

function snapshots(headChanges = {}, removed = [], baseFiles = {}) {
  const { root } = createGitRepository({
    ...baseFiles,
    [`${MAIN}/Price.java`]: PRICE,
    [`${MAIN}/Stock.java`]: 'package shop;\n\npublic class Stock {}\n',
    [`${MAIN}/money/Money.java`]: 'package shop.money;\n\npublic class Money {}\n',
    [`${MAIN}/other/Price.java`]: 'package shop.other;\n\npublic class Price {}\n',
    [`${TEST}/PriceTest.java`]: PRICE_TEST,
  });
  const base = path.join(root, '.base-worktree');
  fixtureGit(root, ['worktree', 'add', '-q', '--detach', '.base-worktree', 'HEAD']);
  for (const file of removed) {
    rmSync(path.join(root, file));
  }
  for (const [file, contents] of Object.entries(headChanges)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), contents);
  }
  fixtureGit(root, ['add', '-A', '--', ':!.base-worktree']);
  fixtureGit(root, ['-c', 'commit.gpgsign=false', 'commit', '-q', '--allow-empty', '-m', 'head']);
  return { base, head: root };
}

function headPlan(roots, policy = {}) {
  return comparisonMutationPlan(roots.head, {
    snapshot: 'head',
    baselineRoot: roots.base,
    ...policy,
  });
}

function basePlan(roots) {
  return comparisonMutationPlan(roots.base, { snapshot: 'base', policyRoot: roots.head });
}

function survivor(file, line) {
  return {
    tool: 'pit',
    rule: 'mutant-survived',
    path: file,
    identity: `${file}:${String(line)}`,
    location: { line },
  };
}

describe('mutation in a comparison', () => {
  it('mutates the changed classes on head and nothing on base when no test changed', () => {
    const roots = snapshots({ [`${MAIN}/Price.java`]: PRICE.replace('count * 2', 'count * 3') });

    const head = headPlan(roots);

    expect(head.scope).toEqual([`${MAIN}/Price.java`]);
    expect([...head.changedOnly]).toEqual([[`${MAIN}/Price.java`, [[5, 5]]]]);
    expect(basePlan(roots).scope).toEqual([]);
  });

  it('keeps mutants of a changed class only on the changed lines', () => {
    const roots = snapshots({ [`${MAIN}/Price.java`]: PRICE.replace('count * 2', 'count * 3') });
    const plan = mutationPlanOf(roots.head, {
      policy: { snapshot: 'head', baselineRoot: roots.base },
    });
    const kept = survivor(`${MAIN}/Price.java`, 5);
    const other = { ...survivor(`${MAIN}/Price.java`, 4), tool: 'pmd' };

    expect(plan.options.policy.mutationScope).toEqual([`${MAIN}/Price.java`]);
    const summary = { tool: 'pit', rule: 'mutation-summary', path: '.', identity: 'status:Killed' };

    expect(plan.findings([kept, survivor(`${MAIN}/Price.java`, 4), other, summary])).toEqual([
      kept,
      other,
    ]);
  });

  it('mutates the classes a changed test uses on both sides, and reports all their mutants', () => {
    const roots = snapshots({ [`${TEST}/PriceTest.java`]: PRICE_TEST.replace('ONE', 'TWO') });
    const reached = [`${MAIN}/Price.java`, `${MAIN}/money/Money.java`];

    const head = headPlan(roots);

    expect(head.scope).toEqual(reached);
    expect(head.changedOnly.size).toBe(0);
    expect(basePlan(roots).scope).toEqual(reached);
  });

  it('follows a deleted test on its base version', () => {
    const roots = snapshots({}, [`${TEST}/PriceTest.java`]);

    expect(headPlan(roots).scope).toEqual([`${MAIN}/Price.java`, `${MAIN}/money/Money.java`]);
  });

  it('applies the paths of the run to the head side', () => {
    const roots = snapshots({
      [`${MAIN}/Price.java`]: PRICE.replace('count * 2', 'count * 3'),
      [`${MAIN}/Stock.java`]: 'package shop;\n\npublic class Stock { int count; }\n',
    });

    expect(headPlan(roots, { mutationScope: [`${MAIN}/Stock.java`] }).scope).toEqual([
      `${MAIN}/Stock.java`,
    ]);
  });

  it('caps the classes reached through changed tests and names the rest', () => {
    const names = Array.from({ length: 12 }, (_, index) => `Part${String(index)}`);
    const parts = Object.fromEntries(
      names.map((name) => [`${MAIN}/${name}.java`, `package shop;\n\npublic class ${name} {}\n`]),
    );
    const created = names.map((name) => `new ${name}()`).join(', ');
    const test = `package shop;\n\nclass PartsTest {\n  Object[] all = { ${created} };\n}\n`;
    const roots = snapshots({ [`${TEST}/PartsTest.java`]: test }, [], parts);

    const head = headPlan(roots);

    expect(head.scope.filter((file) => file.includes('Part'))).toHaveLength(10);
    expect(
      head.notices.map(({ rule, path: file, classification }) => [rule, file, classification]),
    ).toEqual([['tested-modules-capped', `${MAIN}/Part10.java`, 'descriptive']]);
  });

  it('changes nothing outside a comparison or in a quick run', () => {
    const roots = snapshots({ [`${MAIN}/Price.java`]: PRICE.replace('count * 2', 'count * 3') });
    const options = { policy: { snapshot: 'head' } };

    expect(comparisonMutationPlan(roots.head, { snapshot: 'head' })).toBeUndefined();
    expect(headPlan(roots, { quick: true })).toBeUndefined();
    expect(
      comparisonMutationPlan(roots.head, { snapshot: 'base', policyRoot: roots.head }),
    ).toBeUndefined();
    expect(mutationPlanOf(roots.head, options).options).toBe(options);
  });

  it('mutates as before when a root is not a Git checkout', () => {
    const roots = snapshots();
    const copy = mkdtempSync(path.join(tmpdir(), 'nitpicker-plan-'));
    cpSync(path.join(roots.head, 'src'), path.join(copy, 'src'), { recursive: true });

    try {
      expect(headPlan({ base: roots.base, head: copy })).toBeUndefined();
    } finally {
      rmSync(copy, { recursive: true, force: true });
    }
  });
});

describe('a production file moved on head', () => {
  it('is mutated at its base path on base and at its head path on head', () => {
    const roots = snapshots(
      {
        [`${MAIN}/stock/Stock.java`]: 'package shop.stock;\n\npublic class Stock {}\n',
        [`${TEST}/StockTest.java`]: 'package shop;\n\nimport shop.stock.Stock;\n\nclass StockTest {}\n',
      },
      [`${MAIN}/Stock.java`],
    );

    expect(basePlan(roots).scope).toContain(`${MAIN}/Stock.java`);
    expect(headPlan(roots).scope).toContain(`${MAIN}/stock/Stock.java`);
  });
});

describe('JVM test paths', () => {
  it.each([
    ['src/test/java/a/ATest.java', true],
    ['module/src/integrationTest/kotlin/a/A.kt', true],
    ['src/it/java/a/A.java', true],
    ['src/testFixtures/java/a/Fixture.java', true],
    ['test/a/A.java', true],
    ['src/main/java/a/Test.java', false],
    ['src/main/java/a/testing/A.java', false],
    ['src/main/java/com/acme/test/Fixture.java', false],
    ['tests/src/main/java/A.java', false],
    ['src/contest/java/A.java', false],
    ['src/functional-test/java/A.java', true],
    ['src/test/resources/a.json', false],
  ])('%s is a test: %s', (file, expected) => {
    expect(isJvmTestPath(file)).toBe(expected);
  });

  it('keys the base by the changed tests and their head contents, only in full runs', () => {
    const roots = snapshots({ [`${TEST}/PriceTest.java`]: PRICE_TEST.replace('ONE', 'TWO') });
    const touchedPaths = [`${TEST}/PriceTest.java`, `${MAIN}/Price.java`, 'README.md'];
    const key = changedTestsKey({ touchedPaths, headRoot: roots.head, quick: false });

    expect(JSON.parse(key)).toEqual({
      tests: [[`${TEST}/PriceTest.java`, expect.stringMatching(/^[0-9a-f]{64}$/u)]],
      reached: [`${MAIN}/Price.java`, `${MAIN}/money/Money.java`],
    });
    expect(changedTestsKey({ touchedPaths, headRoot: roots.base, quick: false })).not.toBe(key);
    expect(changedTestsKey({ touchedPaths, headRoot: roots.head, quick: true })).toBeUndefined();
  });

  it('keys the base by what the changed tests reach on head', () => {
    const edited = { [`${TEST}/PriceTest.java`]: PRICE_TEST.replace('ONE', 'TWO') };
    const touchedPaths = [`${TEST}/PriceTest.java`];
    const key = (roots) => changedTestsKey({ touchedPaths, headRoot: roots.head, quick: false });

    expect(key(snapshots(edited, [`${MAIN}/money/Money.java`]))).not.toBe(key(snapshots(edited)));
  });

  it('keys a comparison without changed tests apart from a base snapshot', () => {
    const roots = snapshots();

    expect(
      JSON.parse(changedTestsKey({ touchedPaths: ['README.md'], headRoot: roots.head, quick: false })),
    ).toEqual({ tests: [], reached: [] });
  });
});
