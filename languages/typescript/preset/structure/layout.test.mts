import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { analyzeProductionFiles } from './analyze.mts';
import { resolveLayout } from '../layout.mjs';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

it('scans src without src/main and excludes colocated tests', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-layout-'));
  roots.push(root);
  mkdirSync(path.join(root, 'src'));
  writeFileSync(path.join(root, 'src/service.ts'), 'export function service() { return true; }\n');
  writeFileSync(
    path.join(root, 'src/service.test.ts'),
    'export function test() { return true; }\n',
  );
  const report = analyzeProductionFiles(path.join(root, 'src'), 'src');
  expect(report.summary.files).toBe(1);
  expect(report.functions.map((entry) => entry.source)).toEqual(['src/service.ts']);
});

it('returns an empty report if src is absent', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-layout-'));
  roots.push(root);
  expect(analyzeProductionFiles(path.join(root, 'src'), 'src').summary.files).toBe(0);
});

it('analyzes root files and lib of a package whose code sits at the project root', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-root-layout-'));
  roots.push(root);
  const files = [
    'index.js',
    'lib/x.js',
    'test/x.test.js',
    'node_modules/dep/index.js',
    'eslint.config.js',
    'dist/bundle.js',
  ];
  for (const file of files) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), 'exports.value = function value() { return 1; };\n');
  }
  const layout = resolveLayout({ sourceRoots: ['.'] }, [], { javascript: true });
  const report = analyzeProductionFiles(root, '.', { layout });
  expect(report.functions.map((entry) => entry.source).sort()).toEqual(['index.js', 'lib/x.js']);
});
