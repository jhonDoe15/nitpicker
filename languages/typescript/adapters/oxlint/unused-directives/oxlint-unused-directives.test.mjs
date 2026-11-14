import { rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { normalizeEslintResults } from '../../eslint/normalize.mts';
import { withSharedUnusedDirectives } from '../../eslint/merge/unused-directives.mjs';
import { createProject, lintProject } from '../test-support/oxlint-project.mjs';

const policy = (rule) =>
  `export default [{ files: ['src/**/*.ts'], rules: { '${rule}': 'error' } }];\n`;
const SOURCE = [
  '// eslint-disable-next-line no-debugger',
  'export const a = 1;',
  '// eslint-disable-next-line no-eval',
  "eval('x');",
  '',
].join('\n');

let root;
const reports = new Map();

beforeAll(async () => {
  root = createProject('nitpicker-oxlint-unused-', { 'src/a.ts': SOURCE });
  for (const [name, rule] of [
    ['eslint-errors', 'no-debugger'],
    ['eslint-logging', 'no-eval'],
  ]) {
    writeFileSync(path.join(root, 'policy.mjs'), policy(rule));
    const value = await lintProject({ root, patterns: ['src/**/*.ts'] });
    reports.set(name, {
      findings: normalizeEslintResults({ value, projectRoot: root, analyzerName: name }),
    });
  }
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

const analyzers = ['eslint-errors', 'eslint-logging'].map((name) => ({
  name,
  lintedGlobs: { include: ['src/**/*.ts'], exclude: [] },
}));

function unused(report) {
  return report.findings.filter(({ rule }) => rule === 'eslint/unused-disable-directive');
}

describe('unused directives from the oxlint engine', () => {
  it('are reported per analyzer, counting the directive the other analyzer uses', () => {
    expect([...reports.values()].map((report) => unused(report).length)).toEqual([2, 1]);
  });

  it('are merged to the one directive no analyzer used', () => {
    const merged = withSharedUnusedDirectives({ reports }, analyzers);

    const remaining = [...merged.reports.values()].flatMap(unused);
    expect(remaining.map(({ location }) => location.line)).toEqual([1]);
  });
});
