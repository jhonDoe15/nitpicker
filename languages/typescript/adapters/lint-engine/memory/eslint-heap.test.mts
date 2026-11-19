import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { HEAD_POLICY_ENV } from '../../../../../shared/head-policy.mjs';
import { LINT_CONFIG } from '../../../preset/test-environment/resolve-environment.mts';
import { runLintEngine } from '../lint-engine.mts';
import { headPolicyFor, temporaryProjects } from '../test-support/layered-project.mts';
import {
  eslintHeapMegabytes,
  heapMegabytesOf,
  isOutOfMemory,
  outOfMemoryMessage,
  withEslintHeap,
} from './eslint-heap.mts';

const GIB = 1024 ** 3;
const DEFAULT_LIMIT = 2 * GIB;

describe('eslintHeapMegabytes', () => {
  it('gives ESLint three quarters of the memory less a share for each analyzer beside it', () => {
    expect(
      eslintHeapMegabytes({ memory: 15 * GIB, parallel: 4, defaultLimit: DEFAULT_LIMIT }),
    ).toBe(6912);
    expect(
      eslintHeapMegabytes({ memory: 15 * GIB, parallel: 1, defaultLimit: DEFAULT_LIMIT }),
    ).toBe(11_520);
  });

  it("never sets less than Node's own default heap", () => {
    expect(eslintHeapMegabytes({ memory: 4 * GIB, parallel: 4, defaultLimit: DEFAULT_LIMIT })).toBe(
      2048,
    );
  });
});

describe('withEslintHeap', () => {
  const budget = { memory: 15 * GIB, defaultLimit: DEFAULT_LIMIT };

  it('adds the heap flag to the options the run already passes', () => {
    expect(withEslintHeap({ NODE_OPTIONS: '--enable-source-maps' }, budget)).toEqual({
      NODE_OPTIONS: '--enable-source-maps --max-old-space-size=6912',
    });
    expect(withEslintHeap({ NITPICKER_MAX_PARALLEL: '2' }, budget)).toEqual({
      NITPICKER_MAX_PARALLEL: '2',
      NODE_OPTIONS: '--max-old-space-size=9984',
    });
  });

  it('keeps a heap size the user set', () => {
    const environment = { NODE_OPTIONS: '--max_old_space_size=3000' };

    expect(withEslintHeap(environment, budget)).toBe(environment);
    expect(heapMegabytesOf(environment.NODE_OPTIONS)).toBe(3000);
  });
});

describe('the out-of-memory message', () => {
  it('names the heap and the two ways to give ESLint more room', () => {
    expect(isOutOfMemory('FATAL ERROR: Reached heap limit Allocation failed')).toBe(true);
    expect(isOutOfMemory('TypeError: x is not a function')).toBe(false);
    expect(outOfMemoryMessage('--max-old-space-size=6912')).toBe(
      'eslint-lint ran out of memory (6912 MB heap). Lower NITPICKER_MAX_PARALLEL so it gets a larger ' +
        'share of the machine, or give it more heap with NODE_OPTIONS=--max-old-space-size=<MB>, and rerun.',
    );
    expect(outOfMemoryMessage(undefined)).toBe(
      outOfMemoryMessage('--max-old-space-size=6912').replace(
        '6912 MB heap',
        "Node's default heap",
      ),
    );
  });
});

const POLICY = `const hog = {
  meta: { type: 'problem', schema: [] },
  create() {
    const kept = [];
    return { Program() { for (;;) kept.push(new Array(1e5).fill(kept.length)); } };
  },
};
export default [{ files: ['src/**/*.js'], plugins: { x: { rules: { hog } } }, rules: { 'x/hog': 'error' } }];
`;

describe('runLintEngine when ESLint runs out of heap', () => {
  const projects = temporaryProjects();
  afterAll(() => {
    projects.remove();
  });

  it('says it ran out of memory and how to fix it', async () => {
    const root = projects.create({ 'policy.mjs': POLICY, 'src/app.js': 'export const a = 1;\n' });
    const directory = await mkdtemp(path.join(tmpdir(), 'nitpicker-eslint-heap-policy-'));
    try {
      const policy = headPolicyFor({ engine: 'eslint', liveProjectRoot: root });
      await writeFile(path.join(directory, 'policy.json'), JSON.stringify(policy));
      vi.stubEnv(HEAD_POLICY_ENV, path.join(directory, 'policy.json'));
      const run = runLintEngine({
        options: {
          projectRoot: root,
          liveProjectRoot: root,
          configRelativePath: LINT_CONFIG,
          patterns: ['src/**/*.js'],
          timeoutMs: 120_000,
          environment: { NODE_OPTIONS: '--max-old-space-size=96' },
        },
        policyConfigPath: path.join(root, 'policy.mjs'),
      });

      await expect(run).rejects.toThrow(
        'eslint-lint ran out of memory (96 MB heap). Lower NITPICKER_MAX_PARALLEL',
      );
    } finally {
      vi.unstubAllEnvs();
      await rm(directory, { recursive: true, force: true });
    }
  });
});
