import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createVitest } from 'vitest/node';
import { describe, expect, it, vi } from 'vitest';
import { END_TO_END_ROOT, resolveLayout as untypedResolveLayout } from '../layout.mjs';
import { useTemporaryProjects } from '../test-support/temporary-projects.mts';

type Policy = { readonly exclude?: string[]; readonly layout?: { readonly testRoots: string[] } };

const resolveLayout: (
  layout?: Policy['layout'],
  exclude?: Policy['exclude'],
) => { readonly executedTestRoots: readonly string[] } = untypedResolveLayout;

const defaults = path.join(import.meta.dirname, '..', 'defaults');
const importConfig: (
  url: string,
) => Promise<{ default: { forbidden: { to: { path: string } }[] } }> = (url) => import(url);

const { projectWith: writeProject } = useTemporaryProjects('nitpicker-roots-', {
  keepForFile: true,
});
const projectFiles = {
  '__tests__/jest.test.ts': "describe('jest', () => { it('runs', () => { jest.fn(); }); });",
  'e2e/api.test.ts': "it('serves', () => {});",
  'src/add.test.ts': "it('adds', () => {});",
  'test/add.test.ts': "it('adds', () => {});",
};

async function selectedTests(policy: Policy): Promise<string[]> {
  const root = writeProject(projectFiles);
  const policyFile = path.join(
    writeProject({ 'policy.json': JSON.stringify(policy) }),
    'policy.json',
  );
  vi.stubEnv('NITPICKER_POLICY', policyFile);
  const vitest = await createVitest('test', {
    root,
    config: path.join(defaults, 'vitest.quality.config.ts'),
    watch: false,
    reporters: [],
  });
  try {
    const specifications = await vitest.globTestSpecifications();
    return specifications
      .map((specification) => path.relative(root, specification.moduleId))
      .sort();
  } finally {
    await vitest.close();
    vi.unstubAllEnvs();
  }
}

describe('the tests the quality run selects', () => {
  it.each<[string, Policy, string[], string[]]>([
    [
      'those under the default roots, leaving a root e2e folder to its own runner',
      {},
      ['__tests__/jest.test.ts', 'src/add.test.ts', 'test/add.test.ts'],
      ['test', 'tests', '__tests__'],
    ],
    [
      'all but a root __tests__ folder that exclude names',
      { exclude: ['__tests__/**'] },
      ['src/add.test.ts', 'test/add.test.ts'],
      ['test', 'tests', '__tests__'],
    ],
    [
      'those under the listed test roots, e2e included when it is listed',
      { layout: { testRoots: ['test', END_TO_END_ROOT] } },
      ['e2e/api.test.ts', 'src/add.test.ts', 'test/add.test.ts'],
      ['test', END_TO_END_ROOT],
    ],
  ])('are %s', async (_name, policy, selected, executedTestRoots) => {
    expect(await selectedTests(policy)).toEqual(selected);
    expect(resolveLayout(policy.layout, policy.exclude).executedTestRoots).toEqual(
      executedTestRoots,
    );
  });
});

describe('the dependency-cruiser production-to-test rule', () => {
  async function productionToTestTarget() {
    vi.stubEnv('NITPICKER_POLICY', undefined);
    try {
      const url = pathToFileURL(path.join(defaults, 'dependency-cruiser.config.mjs'));
      url.search = 'default-roots';
      const { default: config } = await importConfig(url.href);
      return new RegExp(config.forbidden[0]?.to.path ?? '');
    } finally {
      vi.unstubAllEnvs();
    }
  }

  it('names the root test folders and test files, not a folder called e2e inside the source', async () => {
    const target = await productionToTestTarget();

    expect(
      [
        'e2e/support/page.ts',
        '__tests__/jest.test.ts',
        'test/helper.ts',
        'src/ui/__tests__/panel.ts',
        'src/ui/panel.test.ts',
        'src/crypto/e2e/encrypt.ts',
        'src/test/clock.ts',
      ].map((file) => target.test(file)),
    ).toEqual([true, true, true, true, true, false, false]);
  });
});
