import { describe, expect, it } from 'vitest';
import { useGitFixtures } from '../../diff/git/test-support/git-repository.mjs';
import { createBaseSetupResolver } from './base-setup.mjs';

const { createGitRepository } = useGitFixtures();

describe('createBaseSetupResolver', () => {
  it('measures the base with the stricter threshold, so a tightening keeps legacy findings old', () => {
    const { root } = createGitRepository({
      'nitpicker.config.json': '{ "thresholds": { "fileLines": 500 } }\n',
      'src/a.ts': 'export {};\n',
    });
    const resolve = createBaseSetupResolver({ headConfig: {}, injectedAnalyzers: [] });

    const setup = resolve({ baseProjectRoot: root, headSnapshotRoot: root, analyzers: [] });

    expect(setup.headPolicy.thresholds).toEqual({ fileLines: 300 });
    expect(setup.policyChanges).toEqual(['threshold fileLines lowered from 500 to 300']);
    expect(setup.policyLoosenings).toEqual([]);
  });

  it('gives a base with its own config the facts read from the head checkout', () => {
    const { root } = createGitRepository({
      'nitpicker.config.json': JSON.stringify({
        react: { enabled: false, styling: 'class-names' },
        tools: { prettier: { precedence: ['project', 'nitpicker'] } },
      }),
      'src/a.ts': 'export {};\n',
    });
    const frameworks = { defaultExports: ['app/**/page.tsx'], entryPoints: ['src/main.tsx'] };
    const headPolicy = {
      conventions: { 'prettier.semi': false },
      conventionPins: { 'typescript.fileNames': 'kebab-case' },
      generatedFiles: ['src/api.gen.ts'],
      frameworks,
      libraries: { validation: ['valibot'], logger: ['winston'] },
      react: { enabled: true, major: 18, styling: 'css-in-js', autoCleanup: false },
      i18n: { enabled: true },
      tools: { prettier: { precedence: ['nitpicker'], projectConfigDigest: 'abc' } },
    };
    const resolve = createBaseSetupResolver({ headConfig: {}, headPolicy, injectedAnalyzers: [] });

    const setup = resolve({ baseProjectRoot: root, headSnapshotRoot: root, analyzers: [] });

    expect(setup.headPolicy).toEqual({
      exclude: [],
      layout: {},
      exceptions: [],
      thresholds: {},
      conventions: { 'prettier.semi': false },
      conventionPins: { 'typescript.fileNames': 'kebab-case' },
      generatedFiles: ['src/api.gen.ts'],
      frameworks,
      libraries: { validation: ['valibot'], logger: ['winston'] },
      react: { enabled: true, major: 18, styling: 'css-in-js', autoCleanup: false },
      i18n: { enabled: true },
      tools: { prettier: { precedence: ['project', 'nitpicker'], projectConfigDigest: 'abc' } },
    });
  });

  it('adds no scope or digest the head checkout did not record', () => {
    const { root } = createGitRepository({
      'nitpicker.config.json': '{ "preset": "java", "exclude": ["build/**"] }\n',
    });
    const resolve = createBaseSetupResolver({
      headConfig: { preset: 'java' },
      headPolicy: { conventions: { 'java.indentation': '4' } },
      injectedAnalyzers: [],
    });

    const setup = resolve({ baseProjectRoot: root, headSnapshotRoot: root, analyzers: [] });

    expect(setup.headPolicy).toEqual({
      exclude: [],
      layout: {},
      exceptions: [],
      thresholds: {},
      conventions: { 'java.indentation': '4' },
    });
  });

  it('runs the base policy with the head analyzer timeouts', () => {
    const { root } = createGitRepository({
      'nitpicker.config.json': JSON.stringify({
        disable: ['crap'],
        analyzerTimeoutMinutes: { custom: 1, other: 2 },
      }),
    });
    const analyzer = (name) => ({
      name,
      version: '1',
      configurationHash: 'h',
      exclusions: [],
      createInvocation: () => ({ command: 'node', args: [], env: {} }),
    });
    const head = { disable: [], analyzerTimeoutMinutes: { custom: 30 } };
    const resolve = createBaseSetupResolver({
      headConfig: head,
      injectedAnalyzers: [analyzer('custom'), analyzer('other'), analyzer('crap')],
    });

    const setup = resolve({
      baseProjectRoot: root,
      headSnapshotRoot: root,
      analyzers: [analyzer('custom'), analyzer('other')],
    });

    expect(setup.analyzers.map(({ name, timeoutMs }) => [name, timeoutMs])).toEqual([
      ['custom', 30 * 60_000],
      ['other', undefined],
    ]);
    expect(setup.analyzers[0].configuredTimeout).toBe(true);
    expect(setup.policyChanges).toEqual(['analyzer enabled: crap']);
  });
});
