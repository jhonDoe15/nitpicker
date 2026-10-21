import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { validateConfig } from '../../configuration/validate.mjs';
import {
  resolveHeadPolicy,
  withHeadCheckoutFacts,
} from '../../../languages/typescript/preset/head-policy.mjs';
import { withHeadPolicyFile } from '../../../shared/head-policy.mjs';
import { layeredJscpdConfig, resolveJscpdPolicy } from './config.mjs';
import { runJscpd } from './run-jscpd.mjs';

const roots = [];
function temporaryRoot() {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-jscpd-config-'));
  roots.push(root);
  return root;
}
function projectConfig(root, config) {
  writeFileSync(path.join(root, '.jscpd.json'), JSON.stringify(config));
}
afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const ORDERINGS = [
  [['nitpicker'], 50],
  [['project'], 500],
  [['project', 'nitpicker'], 500],
  [['nitpicker', 'project'], 50],
];

describe('jscpd project config', () => {
  it.each(ORDERINGS)(
    'layers %j with the highest-precedence values first',
    (precedence, minTokens) => {
      const root = temporaryRoot();
      projectConfig(root, { minTokens: 500, ignore: ['vendor/**'] });
      const settings = resolveJscpdPolicy({ precedence }, root);
      const result = layeredJscpdConfig(
        { minTokens: 50, threshold: 100, ignore: ['build/**'] },
        settings,
      );
      expect(result).toEqual({
        minTokens,
        ...(precedence.includes('nitpicker') ? { threshold: 100 } : {}),
        ignore: precedence[0] === 'project' ? ['vendor/**'] : ['build/**'],
      });
    },
  );

  it.each(['typescript', 'javascript', 'java', 'kotlin', 'python'])(
    'accepts all four orderings for %s',
    (preset) => {
      for (const [precedence] of ORDERINGS) {
        expect(validateConfig({ preset, tools: { jscpd: { precedence } } })).toBeDefined();
      }
      for (const precedence of [[], ['project', 'project'], ['unknown'], 'project']) {
        expect(() => validateConfig({ preset, tools: { jscpd: { precedence } } })).toThrow(
          'tools.jscpd.precedence',
        );
      }
    },
  );

  it('does not read a malformed project config without opt-in', () => {
    const root = temporaryRoot();
    writeFileSync(path.join(root, '.jscpd.json'), '{broken');
    expect(resolveJscpdPolicy(undefined, root)).toBeUndefined();
    expect(resolveJscpdPolicy({ precedence: ['nitpicker'] }, root)).toEqual({
      precedence: ['nitpicker'],
    });
  });

  it('rejects missing, malformed, non-object and escaping project configs', () => {
    const root = temporaryRoot();
    const settings = { precedence: ['project'] };
    expect(() => resolveJscpdPolicy(settings, root)).toThrow();
    writeFileSync(path.join(root, '.jscpd.json'), '{broken');
    expect(() => resolveJscpdPolicy(settings, root)).toThrow();
    for (const value of [[], null, 42]) {
      projectConfig(root, value);
      expect(() => resolveJscpdPolicy(settings, root)).toThrow('must contain a JSON object');
    }
    const outside = temporaryRoot();
    projectConfig(outside, {});
    rmSync(path.join(root, '.jscpd.json'));
    symlinkSync(path.join(outside, '.jscpd.json'), path.join(root, '.jscpd.json'));
    expect(() => resolveJscpdPolicy(settings, root)).toThrow('must stay inside the project');
  });

  it('captures head config and its digest for both snapshots without replacing base precedence', () => {
    const root = temporaryRoot();
    const config = { preset: 'python', tools: { jscpd: { precedence: ['project', 'nitpicker'] } } };
    projectConfig(root, { minTokens: 500 });
    const first = resolveHeadPolicy(config, root);
    projectConfig(root, { minTokens: 600 });
    const second = resolveHeadPolicy(config, root);
    expect(first.tools.jscpd.projectConfig).toEqual({ minTokens: 500 });
    expect(second.tools.jscpd.projectConfigDigest).not.toBe(first.tools.jscpd.projectConfigDigest);
    const base = { tools: { jscpd: { precedence: ['nitpicker', 'project'] } } };
    expect(withHeadCheckoutFacts(base, second).tools.jscpd).toEqual({
      ...second.tools.jscpd,
      precedence: ['nitpicker', 'project'],
    });
    expect(withHeadCheckoutFacts({}, second).tools).toBeUndefined();
  });

  it.each(ORDERINGS)('runs the pinned tool with %j', (precedence, minTokens) => {
    const root = temporaryRoot();
    const reportRoot = temporaryRoot();
    mkdirSync(path.join(root, 'src'));
    const source =
      'def total(lines, discount):\n    value = 0\n    for line in lines:\n        if line.price > 0 and line.quantity > 0:\n            value += line.price * line.quantity\n        else:\n            value -= discount\n    if value < 0 and discount > 0:\n        value = 0\n    return value\n';
    for (const name of ['a.py', 'b.py']) writeFileSync(path.join(root, 'src', name), source);
    projectConfig(root, {
      minTokens: 500,
      path: ['/invalid'],
      format: ['java'],
      reporters: ['invalid'],
      output: '/invalid',
    });
    const policy = resolveHeadPolicy({ preset: 'python', tools: { jscpd: { precedence } } }, root);
    withHeadPolicyFile(policy, (policyFile) => {
      vi.stubEnv('NITPICKER_POLICY', policyFile);
      runJscpd({ cwd: root, roots: ['src'], format: 'python', ignore: [], reportRoot });
    });
    const { runs } = JSON.parse(readFileSync(path.join(reportRoot, 'duplicates.json'), 'utf8'));
    expect(runs[0].report.duplicates.length).toBe(minTokens === 500 ? 0 : 1);
  });
});
