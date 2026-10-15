import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { PACKAGE_ROOT } from '../../../tooling/tool-resolution.mjs';
import {
  collectArchitectureSignals,
  collectSignals,
} from '../../../../languages/typescript/preset/coding-standards/check.mjs';
import { configuredAnalyzers } from '../../../../languages/typescript/preset/diff/configured-analyzers.mjs';
import { compareFindings } from '../../comparison/compare.mjs';
import { runAnalyzers } from '../../execution/run-analyzers.mjs';

const packageAnalyzers = configuredAnalyzers();
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
  expect(legacySignals).toEqual([
    {
      file: 'src/main/legacy.ts',
      rule: 'nitpicker/preserve-error-cause',
      source: 'new Error(String(error))',
    },
  ]);
  writeFileSync(
    path.join(baseProjectRoot, 'nitpicker.legacy.json'),
    `${JSON.stringify({ sites: legacySignals.map((site) => ({ ...site, count: 1 })) })}\n`,
  );

  const analyzer = packageAnalyzers.find(({ name }) => name === 'coding-standards');
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
  expect(comparison.unchangedFindings).toEqual([
    {
      tool: 'coding-standards',
      rule: 'nitpicker/preserve-error-cause',
      path: 'src/main/legacy.ts',
      identity: 'source:2b12a180517391cf91a57a1f|count:1',
      message: 'New coding-standard site: new Error(String(error))',
      classification: 'enforceable',
    },
  ]);
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
  writeFileSync(
    path.join(root, 'src/main/legacy.ts'),
    'export function legacy() {\n  try {\n    run();\n  } catch (error) {\n    throw new Error(String(error));\n  }\n}\n',
  );
  mkdirSync(path.join(root, 'tests'), { recursive: true });
  writeFileSync(path.join(root, 'tests/placeholder.ts'), 'export {};\n');
  writeFileSync(
    path.join(root, 'src/main/tsconfig.json'),
    `${JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        module: 'ESNext',
        strict: true,
        types: [],
        lib: ['ES2022'],
      },
      include: ['**/*.ts'],
    })}\n`,
  );
}
