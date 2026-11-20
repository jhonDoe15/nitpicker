import { existsSync, rmSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LISTED_FILES_VARIABLE, listedFiles, withListedFiles } from './listed-files.mts';
import { createProject } from '../test-support/oxlint-project.mts';
import { lintWithOxlint } from '../oxlint-runner.mts';
import { oxlintOptions } from '../test-support/oxlint-runs.mts';

describe('listed files', () => {
  it('reads nothing when no list is named', () => {
    expect(listedFiles({})).toBeUndefined();
    expect(listedFiles({ [LISTED_FILES_VARIABLE]: '' })).toBeUndefined();
  });

  it('hands the list to the run and removes it afterwards', async () => {
    const files = ['src/a.ts', 'src/[id]/page.tsx'];
    const seen = await withListedFiles(files, (environment) =>
      Promise.resolve({
        listPath: environment[LISTED_FILES_VARIABLE] ?? '',
        files: listedFiles(environment),
      }),
    );
    expect(seen.files).toEqual(files);
    expect(existsSync(seen.listPath)).toBe(false);
  });

  it('removes the list when the run fails', async () => {
    let listPath = '';
    await expect(
      withListedFiles(['src/a.ts'], (environment) => {
        listPath = environment[LISTED_FILES_VARIABLE] ?? '';
        return Promise.reject(new Error('lint failed'));
      }),
    ).rejects.toThrow('lint failed');
    expect(existsSync(listPath)).toBe(false);
  });

  it('plans exactly the listed files, whatever characters their names hold', async () => {
    const root = createProject('nitpicker-listed-files-', {
      'policy.mjs':
        "export default [{ files: ['src/**/*.js'], rules: { 'no-debugger': 'error' } }];\n",
      'src/[id].js': 'debugger;\n',
      'src/listed.js': 'debugger;\n',
      'src/unlisted.js': 'debugger;\n',
    });
    try {
      const results = await withListedFiles(['src/[id].js', 'src/listed.js'], (listed) =>
        lintWithOxlint({
          options: oxlintOptions(root, []),
          projectConfigPath: undefined,
          environment: {
            ...process.env,
            ...listed,
            NITPICKER_DIFF_ESLINT_POLICY_CONFIG: `${root}/policy.mjs`,
            NITPICKER_DIFF_ESLINT_PROJECT_ROOT: root,
          },
          runEslintCli: () => Promise.reject(new Error('no rule needs ESLint here')),
        }),
      );
      expect(
        results.map((result) => [
          result.filePath.slice(root.length + 1),
          result.messages.map((message) => message.ruleId),
        ]),
      ).toEqual([
        ['src/[id].js', ['no-debugger']],
        ['src/listed.js', ['no-debugger']],
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
