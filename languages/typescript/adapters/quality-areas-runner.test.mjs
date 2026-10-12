import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PACKAGE_ROOT } from '../../../core/tooling/tool-resolution.mjs';
import { parseArguments, runQualityArea } from './quality-areas-runner.mjs';

const temporaryRoots = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function snapshotWith(files) {
  const parent = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-diff-')));
  temporaryRoots.push(parent);
  const root = path.join(parent, 'head');
  for (const [file, text] of Object.entries(files)) {
    const filePath = path.join(root, file);
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, text);
  }
  return root;
}

function runKind(kind, projectRoot) {
  return runQualityArea(
    parseArguments([
      '--analyzer-name',
      kind,
      '--kind',
      kind,
      '--project-root',
      projectRoot,
      '--policy-root',
      PACKAGE_ROOT,
      '--tool-root',
      PACKAGE_ROOT,
      '--snapshot',
      'head',
    ]),
  );
}

describe('crap runner without a coverage report', () => {
  it('reports a skipped tool error instead of an unknown-coverage finding per function', async () => {
    const projectRoot = snapshotWith({
      'package.json': '{"name":"p","type":"module"}\n',
      'src/main/a.ts': 'export function a(): number {\n  return 1;\n}\n',
      'test/a.test.ts': "import { it } from 'vitest';\nit('x', () => {});\n",
    });

    const findings = await runKind('crap', projectRoot);

    expect(findings).toEqual([
      expect.objectContaining({
        tool: 'crap',
        rule: 'tests-failed-skipped',
        classification: 'tool-error',
      }),
    ]);
  });
});

describe('coverage runner invoked as a script', () => {
  const originalArguments = process.argv;
  const originalExitCode = process.exitCode;

  afterEach(() => {
    process.argv = originalArguments;
    process.exitCode = originalExitCode;
    vi.restoreAllMocks();
  });

  it('lists the failing tests instead of crashing on module initialization', async () => {
    const projectRoot = snapshotWith({
      'package.json': '{"name":"p","type":"module"}\n',
      'src/main/a.ts': 'export function a(): number {\n  return 1;\n}\n',
      'test/a.test.ts':
        "import { expect, it } from 'vitest';\nimport { a } from '../src/main/a';\nit('returns two', () => {\n  expect(a()).toBe(2);\n});\n",
    });
    symlinkSync(
      path.join(PACKAGE_ROOT, 'node_modules'),
      path.join(projectRoot, 'node_modules'),
      'dir',
    );
    const stdout = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    process.argv = [
      originalArguments[0],
      path.join(import.meta.dirname, 'quality-areas-runner.mjs'),
      '--analyzer-name',
      'coverage',
      '--kind',
      'coverage',
      '--project-root',
      projectRoot,
      '--policy-root',
      PACKAGE_ROOT,
      '--tool-root',
      PACKAGE_ROOT,
      '--snapshot',
      'head',
    ];
    vi.resetModules();

    await import('./quality-areas-runner.mjs');

    expect(stderr).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(originalExitCode);
    expect(JSON.parse(stdout.mock.calls[0][0]).findings).toEqual([
      expect.objectContaining({
        rule: 'tests-failed',
        classification: 'tool-error',
        message: expect.stringContaining('returns two'),
      }),
    ]);
  });
});
