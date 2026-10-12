import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { resolveHeadPolicy, withHeadPolicyFile } from '../../typescript/preset/head-policy.mjs';
import { headPolicyEnvironment } from '../../../shared/head-policy.mjs';

const reportScript = path.join(import.meta.dirname, '../../typescript/preset/crap/report.mjs');
const temporaryRoots = [];

afterAll(() => {
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

function projectWith(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-js-crap-'));
  temporaryRoots.push(root);
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), text);
  }
  return root;
}

function crapSummary(root, config) {
  return withHeadPolicyFile(resolveHeadPolicy(config), (policyFile) => {
    const result = spawnSync(process.execPath, [reportScript], {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        ...headPolicyEnvironment(policyFile),
        NITPICKER_PROJECT_ROOT: root,
      },
    });
    expect(result.status, result.stderr).toBe(0);
    return JSON.parse(readFileSync(path.join(root, 'reports/quality/crap/report.json'), 'utf8'))
      .summary;
  });
}

describe('CRAP report for a JavaScript project', () => {
  const sources = {
    'src/main/features/grade/domain/classify.js': branchy,
    'src/main/features/grade/domain/classify-module.mjs': branchy,
    'src/main/features/grade/domain/classify-common.cjs': branchy,
    'src/main/features/grade/domain/classify.ts': branchy,
  };

  it('measures the functions of .js, .mjs, .cjs and .ts files', () => {
    const summary = crapSummary(projectWith(sources), { preset: 'javascript' });

    expect(summary.files).toBe(4);
    expect(summary.functions).toBe(4);
  });

  it('keeps reading only TypeScript files for the TypeScript preset', () => {
    const summary = crapSummary(projectWith(sources), {});

    expect(summary.files).toBe(1);
    expect(summary.functions).toBe(1);
  });
});
