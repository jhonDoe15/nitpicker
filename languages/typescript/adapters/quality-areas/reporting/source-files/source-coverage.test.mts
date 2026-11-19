import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { testOptions } from '../../../test-runners/typed/test-options.mts';
import { COVERAGE_REPORT_PATH, readCoverageFindings } from '../test-report.mts';

const roots: string[] = [];
afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function fileCoverage(file: string) {
  return {
    path: file,
    b: { '0': [1, 0] },
    branchMap: { '0': { loc: { start: { line: 1 } } } },
  };
}

describe('coverage findings of a package with its code at the project root', () => {
  it('reports source files only, not config files, tests, examples or output', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-root-coverage-'));
    roots.push(root);
    const files = [
      'index.js',
      'lib/x.js',
      'eslint.config.js',
      'Gruntfile.js',
      'webpack.config.js',
      'test/helpers/setup.js',
      'examples/demo.js',
      'public/bundle.js',
    ];
    for (const file of files) {
      mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      writeFileSync(path.join(root, file), 'exports.value = 1;\n');
    }
    const report = Object.fromEntries(
      files.map((file) => [path.join(root, file), fileCoverage(path.join(root, file))]),
    );
    mkdirSync(path.join(root, path.dirname(COVERAGE_REPORT_PATH)), { recursive: true });
    writeFileSync(path.join(root, COVERAGE_REPORT_PATH), JSON.stringify(report));
    const policy = path.join(root, 'policy.json');
    writeFileSync(policy, JSON.stringify({ preset: 'javascript', layout: { sourceRoots: ['.'] } }));
    vi.stubEnv('NITPICKER_POLICY', policy);

    const findings = readCoverageFindings(testOptions({ projectRoot: root }), {});

    expect([...new Set(findings.map((finding) => finding.path))].sort()).toEqual([
      'index.js',
      'lib/x.js',
    ]);
  });
});
