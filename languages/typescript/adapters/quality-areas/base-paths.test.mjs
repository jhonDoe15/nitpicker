import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PACKAGE_ROOT } from '../../../../core/tooling/tool-resolution.mjs';
import { commit, fixtureGit } from '../../../../core/diff/git/test-support/git-repository.mjs';
import { renameFile, writeFiles } from '../../../../core/diff/git/test-support/fixture-files.mjs';
import { runQualityArea } from '../quality-areas-runner.mjs';
import { parseArguments } from './arguments.mjs';
import { baselinePathsOf } from './base-paths.mjs';

const PRICE = [
  'export function formatPrice(cents: number, currency: string): string {',
  '  const symbol = currency === "USD" ? "$" : "EUR";',
  '  const whole = Math.floor(Math.abs(cents) / 100);',
  '  const fraction = String(Math.abs(cents) % 100).padStart(2, "0");',
  '  return `${symbol}${whole}.${fraction}`;',
  '}',
  '',
].join('\n');

const fixture = {};

function stateWith(files) {
  return { 'app/package.json': '{"name":"app","type":"module"}\n', ...files };
}

beforeAll(() => {
  const parent = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-diff-paths-')));
  const repository = path.join(parent, 'head');
  writeFiles(
    repository,
    stateWith({ 'app/src/cart/price.ts': PRICE, 'app/src/shop/price.ts': PRICE }),
  );
  fixtureGit(repository, ['init', '-q', '--initial-branch=main']);
  commit(repository, 'base');
  const baseline = path.join(parent, 'base');
  fixtureGit(repository, ['worktree', 'add', '-q', '--detach', baseline, 'HEAD']);
  renameFile(repository, 'app/src/cart/price.ts', 'app/src/orders/price.ts');
  writeFiles(repository, { 'app/src/orders/price.ts': PRICE.replace('"EUR"', '"GBP"') });
  commit(repository, 'head');
  Object.assign(fixture, {
    parent,
    projectRoot: path.join(repository, 'app'),
    baselineRoot: path.join(baseline, 'app'),
  });
});

afterAll(() => {
  rmSync(fixture.parent, { recursive: true, force: true });
});

describe('baselinePathsOf', () => {
  it('maps a moved file of the head snapshot to its path in the base checkout', () => {
    const { projectRoot, baselineRoot } = fixture;

    expect(baselinePathsOf({ snapshot: 'head', projectRoot, baselineRoot })).toEqual(
      new Map([['src/orders/price.ts', 'src/cart/price.ts']]),
    );
  });

  it('maps nothing for the base snapshot, without a base checkout or outside a repository', () => {
    const { projectRoot, baselineRoot } = fixture;
    const outside = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-no-git-')));

    expect(baselinePathsOf({ snapshot: 'base', projectRoot, baselineRoot })).toEqual(new Map());
    expect(baselinePathsOf({ snapshot: 'head', projectRoot })).toEqual(new Map());
    expect(baselinePathsOf({ snapshot: 'head', projectRoot: outside, baselineRoot })).toEqual(
      new Map(),
    );
    rmSync(outside, { recursive: true, force: true });
  });
});

describe('structure runner with a moved copy', () => {
  it('reports the copy that was moved and edited, and names the one that stayed', async () => {
    const { projectRoot, baselineRoot } = fixture;
    const options = parseArguments([
      ...['--analyzer-name', 'structure', '--kind', 'structure'],
      ...['--project-root', projectRoot, '--policy-root', PACKAGE_ROOT],
      ...['--tool-root', PACKAGE_ROOT, '--snapshot', 'head'],
      ...['--baseline-root', baselineRoot],
    ]);

    const findings = await runQualityArea(options);

    expect(
      findings
        .filter(({ rule }) => rule === 'sibling-copy-edit')
        .map(({ path: file, identity, message }) => [file, identity, message.split(',')[0]]),
    ).toEqual([
      [
        'src/orders/price.ts',
        'sibling-copy:formatPrice',
        'formatPrice is edited here but not in src/shop/price.ts',
      ],
    ]);
  });
});
