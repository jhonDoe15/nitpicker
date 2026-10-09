import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { analyzeProductionFiles } from './analyze.mjs';

const roots = [];
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
