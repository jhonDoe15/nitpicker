import { mkdirSync, mkdtempSync, rmSync, writeFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { withMovesFile } from '../../../../core/diff/git/patches/moves-file.mjs';
import { PACKAGE_ROOT } from '../../../../core/tooling/tool-resolution.mjs';
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
const MOVES = new Map([['src/cart/price.ts', 'src/orders/price.ts']]);
const parents = [];

afterAll(() => {
  for (const parent of parents) rmSync(parent, { recursive: true, force: true });
});

function snapshots(baseFiles, headFiles) {
  const parent = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-diff-paths-')));
  parents.push(parent);
  for (const [side, files] of [
    ['base', baseFiles],
    ['head', headFiles],
  ]) {
    for (const [file, text] of Object.entries({ 'package.json': '{"name":"app"}\n', ...files })) {
      mkdirSync(path.dirname(path.join(parent, side, file)), { recursive: true });
      writeFileSync(path.join(parent, side, file), text);
    }
  }
  writeFileSync(path.join(parent, 'moves.json'), JSON.stringify([...MOVES]));
  return {
    baselineRoot: path.join(parent, 'base'),
    projectRoot: path.join(parent, 'head'),
    movesFile: path.join(parent, 'moves.json'),
  };
}

async function siblingRows(options) {
  const findings = await runQualityArea(parseArguments(options));
  return findings
    .filter(({ rule }) => rule === 'sibling-copy-edit')
    .map(({ path: file, message }) => [file, message.split(',')[0]]);
}

describe('baselinePathsOf', () => {
  it('maps a moved file of the head snapshot to its path in the base checkout', () => {
    const paths = withMovesFile(MOVES, (baselineMovesFile) =>
      baselinePathsOf({ snapshot: 'head', baselineMovesFile }),
    );

    expect(paths).toEqual(new Map([['src/orders/price.ts', 'src/cart/price.ts']]));
  });

  it('maps nothing for the base snapshot or without a moves file', () => {
    const base = withMovesFile(MOVES, (baselineMovesFile) =>
      baselinePathsOf({ snapshot: 'base', baselineMovesFile }),
    );

    expect(base).toEqual(new Map());
    expect(baselinePathsOf({ snapshot: 'head' })).toEqual(new Map());
  });
});

describe('structure runner with a moved copy', () => {
  const edited = PRICE.replace('"EUR"', '"GBP"');

  function options({ baselineRoot, projectRoot }, extra) {
    return [
      ...['--analyzer-name', 'structure', '--kind', 'structure'],
      ...['--project-root', projectRoot, '--policy-root', PACKAGE_ROOT],
      ...['--tool-root', PACKAGE_ROOT, '--snapshot', 'head'],
      ...['--baseline-root', baselineRoot, ...extra],
    ];
  }

  it('reports the copy that was moved and edited, and names the one that stayed', async () => {
    const roots = snapshots(
      { 'src/cart/price.ts': PRICE, 'src/shop/price.ts': PRICE },
      { 'src/orders/price.ts': edited, 'src/shop/price.ts': PRICE },
    );

    const rows = await siblingRows(options(roots, ['--baseline-moves-file', roots.movesFile]));

    expect(rows).toEqual([
      ['src/orders/price.ts', 'formatPrice is edited here but not in src/shop/price.ts'],
    ]);
  });

  it('treats the moved and edited copy as new when no move is handed over', async () => {
    const roots = snapshots(
      { 'src/cart/price.ts': PRICE, 'src/shop/price.ts': PRICE },
      { 'src/orders/price.ts': edited, 'src/shop/price.ts': PRICE },
    );

    expect(await siblingRows(options(roots, []))).toEqual([]);
  });
});
