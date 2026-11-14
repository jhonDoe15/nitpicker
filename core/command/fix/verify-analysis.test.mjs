import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { PACKAGE_ROOT } from '../../tooling/tool-resolution.mjs';
import { runTasksInProcess } from '../../diff/execution/test-support/in-process-analyzers.mjs';
import { fixAnalysis } from './verify-analysis.mts';

const roots = [];

function projectWithSource() {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-verify-live-'));
  roots.push(root);
  mkdirSync(path.join(root, 'src'));
  writeFileSync(path.join(root, 'package.json'), '{"name":"live"}\n');
  writeFileSync(path.join(root, 'src/a.ts'), 'export const a = 1;\n');
  return root;
}

function recordingAnalyzer(seen) {
  return {
    name: 'typescript-typecheck',
    version: '1.0.0',
    configurationHash: 'fixture',
    exclusions: [],
    findingExitCodes: [1],
    createInvocation(roots_) {
      seen.push({
        projectRoot: roots_.projectRoot,
        projectPolicyRoot: roots_.projectPolicyRoot,
        liveProjectRoot: roots_.liveProjectRoot,
        toolRoot: roots_.toolRoot,
        source: readFileSync(path.join(roots_.projectRoot, 'src/a.ts'), 'utf8'),
        copyExistedDuringRun: existsSync(roots_.projectRoot),
      });
      return { command: process.execPath, args: ['-e', ''], cwd: roots_.projectRoot };
    },
  };
}

function verifyWith(live, seen) {
  return fixAnalysis({
    options: { quick: true, analyzerNames: [] },
    currentProjectRoot: live,
    analyzers: [recordingAnalyzer(seen)],
    runTasks: runTasksInProcess,
    headPolicy: { exclude: [], conventions: {} },
  })({ tools: ['typescript-typecheck'], files: ['src/a.ts'], mode: 'narrow' });
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('--fix verification analysis', () => {
  it('analyzes a generated copy of the project as a head snapshot', () => {
    const live = projectWithSource();
    const seen = [];

    verifyWith(live, seen);

    const [call] = seen;
    expect(seen).toHaveLength(1);
    expect(path.basename(call.projectRoot)).toBe('head');
    expect(path.basename(path.dirname(call.projectRoot)).startsWith('nitpicker-diff-fix-')).toBe(
      true,
    );
    expect(call).toEqual({
      projectRoot: call.projectRoot,
      projectPolicyRoot: call.projectRoot,
      liveProjectRoot: live,
      toolRoot: PACKAGE_ROOT,
      source: 'export const a = 1;\n',
      copyExistedDuringRun: true,
    });
  });
  it('removes the copy after the analysis and leaves the project untouched', () => {
    const live = projectWithSource();
    const seen = [];

    verifyWith(live, seen);

    expect(existsSync(path.dirname(seen[0].projectRoot))).toBe(false);
    expect(readFileSync(path.join(live, 'src/a.ts'), 'utf8')).toBe('export const a = 1;\n');
  });
});
