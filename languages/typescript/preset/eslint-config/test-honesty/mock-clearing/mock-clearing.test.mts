import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';
import { resolveLayout as untypedResolveLayout } from '../../../layout.mts';
import { type ResolvedLayout, linterConfigs } from '../../typed/config-types.mts';
import { lintFixture } from '../../typed/lint-fixture.mts';
import { testHonestyConfigFor } from '../index.mts';
import { useTemporaryProjects } from '../../../test-support/temporary-projects.mts';
import { mockClearingScopes } from './mock-clearing.mts';

const resolveLayout: () => ResolvedLayout = untypedResolveLayout;
const { projectWith } = useTemporaryProjects('nitpicker-mock-clearing-');
const SHARED_MOCK = [
  "import { expect, it, vi } from 'vitest';",
  'const send = vi.fn();',
  "it('a', () => { notify(send); expect(send).toHaveBeenCalledTimes(1); });",
  "it('b', () => { notify(send); });",
].join('\n');

describe('folders whose runner clears mocks between tests', () => {
  it.each([
    ['no runner config', { 'package.json': '{}' }, []],
    [
      'clearMocks in a Jest config',
      { 'jest.config.js': 'module.exports = { clearMocks: true };' },
      ['.'],
    ],
    [
      'mockReset in a package Vitest config',
      { 'packages/web/vitest.config.ts': 'export default { test: { mockReset: true } };' },
      ['packages/web'],
    ],
    [
      'clearAllMocks in a setup file the config names',
      {
        'vitest.config.mts': "export default { test: { setupFiles: ['./test/setup.ts'] } };",
        'test/setup.ts': 'afterEach(() => { vi.clearAllMocks(); });',
      },
      ['.'],
    ],
    [
      'a Jest setup file named with <rootDir>',
      {
        'jest.config.js': "module.exports = { setupFilesAfterEnv: ['<rootDir>/setup.js'] };",
        'setup.js': 'beforeEach(() => jest.resetAllMocks());',
      },
      ['.'],
    ],
    [
      'resetMocks in the jest key of package.json',
      { 'package.json': JSON.stringify({ jest: { resetMocks: true } }) },
      ['.'],
    ],
    [
      'react-scripts, which resets mocks by default',
      { 'app/package.json': JSON.stringify({ devDependencies: { 'react-scripts': '5.0.1' } }) },
      ['app'],
    ],
    [
      'a shared config that cannot be read',
      { 'jest.config.js': "module.exports = { ...require('@acme/jest-config') };" },
      ['.'],
    ],
    [
      'an unknown preset',
      { 'jest.config.js': "module.exports = { preset: '@acme/jest-preset' };" },
      ['.'],
    ],
    [
      'tooling imports and ts-jest only',
      {
        'vitest.config.ts':
          "import react from '@vitejs/plugin-react';\nimport { defineConfig } from 'vitest/config';\nexport default defineConfig({ plugins: [react()] });",
        'jest.config.js': "module.exports = { preset: 'ts-jest' };",
      },
      [],
    ],
  ])('finds %s', (_name, files, expected) => {
    expect(mockClearingScopes(projectWith(files))).toEqual(expected);
  });

  it('turn the shared mock check off in those folders only', () => {
    const layout = resolveLayout();
    const config = linterConfigs([
      { languageOptions: { parser: tseslint.parser } },
      ...testHonestyConfigFor(layout, { mockClearingScopes: ['test/web'] }),
    ]);
    const ruleIds = (filename: string) =>
      lintFixture({ config, filename, code: SHARED_MOCK }).map(({ ruleId }) => ruleId);

    expect(ruleIds('test/a.test.ts')).toEqual(['nitpicker/no-uncleared-shared-mock']);
    expect(ruleIds('test/web/a.test.ts')).toEqual([]);
  });
});
