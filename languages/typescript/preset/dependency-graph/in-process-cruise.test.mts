import { cruise as runDependencyCruiser } from 'dependency-cruiser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { withHeadPolicyFile as untypedWithHeadPolicyFile } from '../head-policy.mjs';
import { EXCLUDED_PATH_PATTERN, resolveLayout } from '../layout.mjs';
import { cruise as untypedCruise } from './cruise.mjs';
import { cruiseInProcess } from './test-support/in-process-cruise.mts';

const cruise: (
  paths: readonly string[],
  options: { readonly typeScriptRoot: string },
) => { readonly modules: readonly { readonly source: string }[] } = untypedCruise;

const withHeadPolicyFile: (policy: object, run: (policyFile: string) => void) => void =
  untypedWithHeadPolicyFile;

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
    const ruleSet = { forbidden: [], options: { doNotFollow: exclusion } };
    const report = await runDependencyCruiser([], {
      exclude: exclusion,
      ruleSet,
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

  it('returns the same modules as the production cruise() run', async () => {
    const paths = ['languages/typescript/preset/coupling/fixtures/signal/src/main'];
    const options = { typeScriptRoot: 'languages/typescript/preset/coupling/fixtures/signal' };

    expect((await cruiseInProcess(paths, options)).modules).toEqual(cruise(paths, options).modules);
  });
});
