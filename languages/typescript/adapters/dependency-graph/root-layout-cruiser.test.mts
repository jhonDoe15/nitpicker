import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { withDefaultAnalyzerParallelism as untypedParallelism } from '../../../../core/diff/execution/test-support/analyzer-parallelism.mts';
import { runAnalyzers } from '../../../../core/diff/execution/run-analyzers.mts';
import { prepareTask } from '../../../../core/diff/execution/preparation/prepare-task.mts';
import { memoryEstimateMegabytes } from '../../../../core/diff/execution/preparation/project-size.mts';
import { useGitFixtures } from '../../../../core/diff/git/test-support/git-repository.mts';
import { applyLayout, configuredAnalyzers } from '../../preset/diff/configured-analyzers.mts';
import { resolveHeadPolicy, withHeadPolicyFile } from './typed/head-policy-views.mts';

const withDefaultAnalyzerParallelism: <T>(run: () => T) => T = untypedParallelism;
const packageRoot = path.resolve(import.meta.dirname, '../../../..');
const MINUTE_MS = 60_000;
const TOOL_TIMEOUT_MS = 60_000;
const temporaryRoots: string[] = [];
const git = useGitFixtures();

afterAll(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function createFixture(files: Record<string, string>): string {
  const temporaryRoot = mkdtempSync(path.join(tmpdir(), 'nitpicker-diff-'));
  temporaryRoots.push(temporaryRoot);
  const projectRoot = path.join(temporaryRoot, 'base');
  for (const [relativePath, contents] of Object.entries(files)) {
    const filePath = path.join(projectRoot, relativePath);
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, contents);
  }
  return projectRoot;
}

describe('sourceRoots: ["."] with dependency-cruiser and size-scaled budgets', () => {
  it(
    'runs all four dependency-cruiser analyzers without a safe-regex refusal',
    () => {
      const policy = resolveHeadPolicy({ layout: { sourceRoots: ['.'] } });
      const analyzers = applyLayout(configuredAnalyzers(), policy).filter((analyzer) =>
        ['dependency-architecture', 'coupling', 'entry-points', 'test-runtime'].includes(
          analyzer.name,
        ),
      );
      const projectRoot = createFixture({
        'views/home.ts': "export { greet } from '../utils/greet.js';\n",
        'utils/greet.ts': 'export function greet(name: string): string {\n  return name;\n}\n',
        'views/home.test.ts':
          "import { expect, it } from 'vitest';\nimport { greet } from '../utils/greet.js';\n\nit('greets', () => {\n  expect(greet('a')).toBe('a');\n});\n",
        'dist/ignored.js': 'export const ignored = 1;\n',
        'vite.config.ts': 'export default {};\n',
      });
      const run = withDefaultAnalyzerParallelism(() =>
        withHeadPolicyFile(policy, (headPolicyFile) =>
          runAnalyzers({
            analyzers,
            projectRoot,
            policyRoot: projectRoot,
            toolRoot: packageRoot,
            liveProjectRoot: packageRoot,
            snapshot: 'head',
            baselineRoot: undefined,
            baselineMovesFile: undefined,
            mutationScope: undefined,
            logRoot: undefined,
            runTasks: undefined,
            headPolicyFile,
          }),
        ),
      );
      expect(run.toolErrors).toEqual([]);
      expect([...run.reports.keys()].sort()).toEqual([
        'coupling',
        'dependency-architecture',
        'entry-points',
        'test-runtime',
      ]);
    },
    TOOL_TIMEOUT_MS,
  );

  it('scales timeoutScale and memoryScale from root-level files for sourceRoots: ["."]', () => {
    const files: Record<string, string> = {
      'static/app/nitpicker.config.json': JSON.stringify({
        preset: 'typescript',
        layout: { sourceRoots: ['.'] },
      }),
    };
    for (let index = 0; index < 1_005; index += 1) {
      files[`static/app/views/view-${String(index)}.tsx`] = 'export const v = 1;\n';
    }
    const { root } = git.createGitRepository(files, { prefix: 'nitpicker-root-scale-' });
    const packageDir = path.join(root, 'static/app');
    const policy = resolveHeadPolicy({ layout: { sourceRoots: ['.'] } });
    const structure = applyLayout(configuredAnalyzers(), policy).find(
      (analyzer) => analyzer.name === 'structure',
    );
    expect(structure).toBeDefined();
    const preparation = prepareTask(
      structure,
      {
        projectRoot: packageDir,
        policyRoot: packageDir,
        toolRoot: packageRoot,
        snapshot: 'head',
        baselineRoot: undefined,
        baselineMovesFile: undefined,
        liveProjectRoot: packageDir,
        mutationScope: undefined,
        logRoot: undefined,
      },
      undefined,
    );
    expect(preparation.kind).toBe('ready');
    if (preparation.kind === 'ready') {
      expect(preparation.task.timeoutMs).toBe(9 * MINUTE_MS);
      expect(preparation.task.sizeAllowanceMs).toBe(4 * MINUTE_MS);
      expect(preparation.task.memoryMegabytes).toBe(603);
    }
    expect(memoryEstimateMegabytes(structure, packageDir)).toBe(603);
  });

  it('counts only the configured layout roots when sourceRoots names a custom folder', () => {
    const files: Record<string, string> = {};
    for (let index = 0; index < 1_005; index += 1) {
      files[`vendor/generated-${String(index)}.ts`] = 'export const v = 1;\n';
    }
    files['lib/app.ts'] = 'export const app = 1;\n';
    const { root } = git.createGitRepository(files, { prefix: 'nitpicker-custom-scale-' });
    const policy = resolveHeadPolicy({ layout: { sourceRoots: ['lib'] } });
    const structure = applyLayout(configuredAnalyzers(), policy).find(
      (analyzer) => analyzer.name === 'structure',
    );
    const preparation = prepareTask(
      structure,
      {
        projectRoot: root,
        policyRoot: root,
        toolRoot: packageRoot,
        snapshot: 'head',
        baselineRoot: undefined,
        baselineMovesFile: undefined,
        liveProjectRoot: root,
        mutationScope: undefined,
        logRoot: undefined,
      },
      undefined,
    );
    expect(preparation.kind).toBe('ready');
    if (preparation.kind === 'ready') {
      expect(preparation.task.timeoutMs).toBe(7 * MINUTE_MS);
      expect(preparation.task.memoryMegabytes).toBe(1);
    }
  });
});
