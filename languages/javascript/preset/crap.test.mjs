import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { PACKAGE_ROOT } from '../../../core/tooling/tool-resolution.mjs';
import { parseArguments, runQualityArea } from '../../typescript/adapters/quality-areas-runner.mjs';
import { resolveHeadPolicy } from '../../typescript/preset/head-policy.mjs';

const originalPolicy = process.env.NITPICKER_POLICY;
const temporaryRoots = [];

afterEach(() => {
  if (originalPolicy === undefined) {
    delete process.env.NITPICKER_POLICY;
  } else {
    process.env.NITPICKER_POLICY = originalPolicy;
  }
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

const branchy = `export function classify(value) {
  if (value > 10) return 'big';
  if (value > 5) return 'medium';
  return value > 0 ? 'small' : 'none';
}
`;

const sources = {
  'src/main/features/grade/domain/classify.js': branchy,
  'src/main/features/grade/domain/classify-module.mjs': branchy,
  'src/main/features/grade/domain/classify-common.cjs': branchy,
  'src/main/features/grade/domain/classify.ts': branchy,
};

async function measuredFiles(config) {
  const parent = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-diff-')));
  temporaryRoots.push(parent);
  const root = path.join(parent, 'head');
  for (const [name, text] of Object.entries(sources)) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), text);
  }
  const policyFile = path.join(parent, 'policy.json');
  writeFileSync(policyFile, JSON.stringify(resolveHeadPolicy(config)));
  process.env.NITPICKER_POLICY = policyFile;
  const options = parseArguments([
    '--analyzer-name',
    'crap',
    '--kind',
    'crap',
    '--project-root',
    root,
    '--policy-root',
    PACKAGE_ROOT,
    '--tool-root',
    PACKAGE_ROOT,
    '--snapshot',
    'head',
  ]);
  const findings = await runQualityArea(options);
  return findings.find(({ identity }) => identity === 'summary:files')?.metric.value;
}

describe('CRAP report for a JavaScript project', () => {
  it('measures .js, .mjs, .cjs and .ts files', async () => {
    expect(await measuredFiles({ preset: 'javascript' })).toBe(4);
  });

  it('keeps reading only TypeScript files for the TypeScript preset', async () => {
    expect(await measuredFiles({})).toBe(1);
  });
});
