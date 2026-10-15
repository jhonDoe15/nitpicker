import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createBaseSetupResolver } from './base-setup.mjs';
import { configureAnalyzers } from './configure-analyzers.mjs';
import { presetAnalyzers } from './preset-analyzers.mjs';
import { resolveHeadPolicy } from '../shared/head-policy.mjs';

const roots = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function baseWith(config) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-base-setup-'));
  roots.push(root);
  mkdirSync(root, { recursive: true });
  writeFileSync(path.join(root, 'nitpicker.config.json'), JSON.stringify(config));
  return root;
}

function duplicateArguments(analyzer) {
  const { args } = analyzer.createInvocation({
    projectRoot: '/p',
    toolRoot: '/t',
    snapshot: 'base',
    projectPolicyRoot: tmpdir(),
    baselineRoot: tmpdir(),
  });
  const index = args.indexOf('--duplicate-skipped-folders');
  return index < 0 ? undefined : args[index + 1];
}

describe.each([
  ['java', ['["build"]']],
  ['kotlin', ['["build"]']],
  ['python', ['["build"]', undefined]],
])('the base of a %s project', (preset, expected) => {
  const headConfig = { preset, duplicates: { skippedFolders: ['build'] } };
  const headAnalyzers = configureAnalyzers(
    presetAnalyzers(headConfig),
    headConfig,
    resolveHeadPolicy(headConfig),
  );

  it('runs its duplicate scan with the head folder list, whatever the base config says', () => {
    const resolve = createBaseSetupResolver({ headConfig });
    const bases = [
      { preset },
      { preset, duplicates: { skippedFolders: ['dist'] } },
      { preset, thresholds: { crapLimit: 12 } },
      { preset, thresholds: { crapLimit: 12 }, duplicates: { skippedFolders: ['dist'] } },
    ].map((config) => resolve({ baseProjectRoot: baseWith(config), analyzers: headAnalyzers }));

    expect(bases.map(({ analyzers = headAnalyzers }) => analyzers.map(duplicateArguments))).toEqual(
      Array.from({ length: 4 }, () => headAnalyzers.map(duplicateArguments)),
    );
    expect(headAnalyzers.map(duplicateArguments)).toEqual(expected);
  });
});
