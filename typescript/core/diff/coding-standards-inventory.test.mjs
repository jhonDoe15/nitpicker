import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { PACKAGE_ROOT } from '../../adapters/tool-resolution.mjs';
import {
  collectArchitectureSignals,
  collectSignals,
} from '../../preset/coding-standards/check.mjs';
import { configuredAnalyzers } from '../../preset/diff/configured-analyzers.mjs';
import { compareFindings } from './compare.mjs';
import { runAnalyzers } from './run-analyzers.mjs';

const temporaryRoots = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

it('compares both sides using the head coding inventory when that inventory entry is removed', async () => {
  const baseProjectRoot = createSnapshotRoot();
  const headProjectRoot = createSnapshotRoot();
  writeProject(baseProjectRoot);
  writeProject(headProjectRoot);

  const legacySignals = [
    ...(await collectSignals(baseProjectRoot, PACKAGE_ROOT)),
    ...collectArchitectureSignals(baseProjectRoot),
  ];
  expect(legacySignals).toContainEqual(
    expect.objectContaining({ rule: '@typescript-eslint/no-explicit-any' }),
  );
  mkdirSync(path.join(baseProjectRoot, 'preset/coding-standards'), {
    recursive: true,
  });
  writeFileSync(
    path.join(baseProjectRoot, 'preset/coding-standards/legacy-sites.json'),
    `${JSON.stringify({ sites: legacySignals.map((site) => ({ ...site, count: 1 })) })}\n`,
  );

  const analyzer = configuredAnalyzers.find(({ name }) => name === 'coding-standards');
  const baseRun = runAnalyzers({
    analyzers: [analyzer],
    projectRoot: baseProjectRoot,
    policyRoot: headProjectRoot,
    toolRoot: PACKAGE_ROOT,
    liveProjectRoot: PACKAGE_ROOT,
    snapshot: 'base',
  });
  const headRun = runAnalyzers({
    analyzers: [analyzer],
    projectRoot: headProjectRoot,
    policyRoot: headProjectRoot,
    toolRoot: PACKAGE_ROOT,
    liveProjectRoot: PACKAGE_ROOT,
    snapshot: 'head',
    baselineRoot: baseProjectRoot,
  });
  const comparison = compareFindings({
    baseFindings: baseRun.reports.get('coding-standards')?.findings ?? [],
    headFindings: headRun.reports.get('coding-standards')?.findings ?? [],
  });

  expect(baseRun.toolErrors).toEqual([]);
  expect(headRun.toolErrors).toEqual([]);
  expect(comparison.newFindings).toEqual([]);
  expect(comparison.unchangedFindings).toContainEqual(
    expect.objectContaining({
      rule: '@typescript-eslint/no-explicit-any',
      classification: 'enforceable',
    }),
  );
});

function createSnapshotRoot() {
  const temporaryRoot = mkdtempSync(path.join(tmpdir(), 'nitpicker-diff-coding-inventory-'));
  temporaryRoots.push(temporaryRoot);
  const projectRoot = path.join(temporaryRoot, 'base');
  mkdirSync(projectRoot);
  return projectRoot;
}

function writeProject(root) {
  mkdirSync(path.join(root, 'src/main'), { recursive: true });
  writeFileSync(path.join(root, 'src/main/legacy.ts'), 'export const legacy: any = 1;\n');
  mkdirSync(path.join(root, 'tests'), { recursive: true });
  writeFileSync(path.join(root, 'tests/placeholder.ts'), 'export {};\n');
  writeFileSync(
    path.join(root, 'src/main/tsconfig.json'),
    `${JSON.stringify({
      compilerOptions: { target: 'ES2022', module: 'ESNext', strict: true },
      include: ['**/*.ts'],
    })}\n`,
  );
}
