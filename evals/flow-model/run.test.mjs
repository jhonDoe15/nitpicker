import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { generate } from './run.mjs';

describe('generate', () => {
  let root;
  let generated;

  beforeAll(() => {
    root = mkdtempSync(path.join(tmpdir(), 'flow-model-'));
    generated = generate(root);
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function readJson(relative) {
    return JSON.parse(readFileSync(path.join(root, 'reports/flow-model', relative), 'utf8'));
  }

  it('writes the summary, findings, diff and views under the given root', () => {
    expect(readdirSync(path.join(root, 'reports/flow-model')).sort()).toEqual([
      'diff.json',
      'findings.json',
      'fixtures',
      'real',
      'summary.json',
      'synthetic',
    ]);
  });

  it('writes the same summary and findings count that it returns', () => {
    const { summary, targets } = readJson('summary.json');

    expect([summary, readJson('findings.json').findings.length, targets.length]).toEqual([
      generated.summary,
      generated.findings,
      generated.targets + 1,
    ]);
  });

  it('finds no oracle disagreement and no label mismatch', () => {
    const { fixtures, lookup } = generated.summary;

    expect([
      fixtures.labelMismatches,
      fixtures.oracle.exact.disagreements,
      fixtures.oracle.subset.disagreements,
      lookup.labelMismatches,
      lookup.oracle.exact.disagreements,
      lookup.oracle.subset.disagreements,
    ]).toEqual([0, 0, 0, 0, 0, 0]);
  });
});
