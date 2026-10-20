import { cruise as runDependencyCruiser } from 'dependency-cruiser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { withHeadPolicyFile } from '../head-policy.mjs';
import { EXCLUDED_PATH_PATTERN, resolveLayout } from '../layout.mjs';
import { cruise } from './cruise.mjs';
import { cruiseInProcess } from './test-support/in-process-cruise.mjs';

describe('in-process dependency graph fixture', () => {
  afterEach(() => vi.unstubAllEnvs());

  it.each([
    'tests/**/*legacy*',
    '**/*.test.ts',
    'src/**/legacy.ts',
    'src/**/test/**/legacy.{ts,js}',
  ])('accepts %s in the combined dependency-cruiser exclusion', async (glob) => {
    const { excludePattern } = resolveLayout({}, [glob]);
    const exclusion = { path: [EXCLUDED_PATH_PATTERN, excludePattern].join('|') };
    const report = await runDependencyCruiser([], {
      exclude: exclusion,
      ruleSet: { options: { doNotFollow: exclusion } },
      outputType: 'json',
    });

    expect(report.exitCode).toBe(0);
  });

  it('cruises with a directory globstar exclusion and keeps the other modules', () => {
    const root = 'languages/typescript/preset/coupling/fixtures/signal';
    withHeadPolicyFile({ exclude: [`${root}/**/shared/**`] }, (policyFile) => {
      vi.stubEnv('NITPICKER_POLICY', policyFile);
      const graph = cruise([`${root}/src/main`], { typeScriptRoot: root });

      expect(graph.modules.map((module) => module.source).sort()).toEqual([
        `${root}/src/main/alpha/first.ts`,
        `${root}/src/main/alpha/second.ts`,
        `${root}/src/main/beta/consumer.ts`,
      ]);
    });
  });

  // Policy tests use `cruiseInProcess` for speed; compare it with the production CLI call here.
  it('returns the same modules as the production cruise() run', async () => {
    const paths = ['languages/typescript/preset/coupling/fixtures/signal/src/main'];
    const options = { typeScriptRoot: 'languages/typescript/preset/coupling/fixtures/signal' };

    expect((await cruiseInProcess(paths, options)).modules).toEqual(cruise(paths, options).modules);
  });
});
