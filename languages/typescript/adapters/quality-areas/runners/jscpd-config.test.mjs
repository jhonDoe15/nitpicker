import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PACKAGE_ROOT } from '../../../../../core/tooling/tool-resolution.mjs';
import { resolveHeadPolicy, withHeadPolicyFile } from '../../../preset/head-policy.mjs';
import { runDuplicates } from './repository.mjs';

const roots = [];
afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function analyze(precedence, projectConfig) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-jscpd-layers-'));
  roots.push(root);
  cpSync(
    path.join(PACKAGE_ROOT, 'languages/typescript/preset/duplicates/fixtures/clones'),
    path.join(root, 'src'),
    { recursive: true },
  );
  writeFileSync(path.join(root, '.jscpd.json'), JSON.stringify(projectConfig));
  const policy = resolveHeadPolicy({ tools: { jscpd: { precedence } } }, root);
  return withHeadPolicyFile(policy, (policyFile) => {
    vi.stubEnv('NITPICKER_POLICY', policyFile);
    return runDuplicates({
      projectRoot: root,
      policyRoot: PACKAGE_ROOT,
      liveProjectRoot: PACKAGE_ROOT,
      analyzerName: 'duplicates',
    });
  });
}

describe('TypeScript jscpd config execution', () => {
  it.each([
    [['nitpicker'], true],
    [['project'], false],
    [['project', 'nitpicker'], false],
    [['nitpicker', 'project'], true],
  ])('runs %j with project-only minTokens and owned report/source paths', (precedence, reports) => {
    const findings = analyze(precedence, {
      minTokens: 10000,
      path: ['/missing'],
      format: ['python'],
      reporters: ['invalid'],
      output: '/invalid',
    });
    expect(findings.some(({ rule }) => rule === 'duplicate-clone')).toBe(reports);
  });

  it('compares clone findings even when the native overall threshold exits with one', () => {
    const findings = analyze(['project', 'nitpicker'], { threshold: 0 });
    expect(
      findings.filter(({ rule }) => rule === 'duplicate-clone').map(({ path: file }) => file),
    ).toEqual(['src/first.ts']);
  });
});
