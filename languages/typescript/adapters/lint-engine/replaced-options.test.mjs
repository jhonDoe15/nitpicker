import { afterAll, describe, expect, it } from 'vitest';
import { replacedEslintOptions } from './replaced-options.mjs';
import { temporaryProjects } from './test-support/layered-project.mjs';

const projects = temporaryProjects();
const CONFIG = { tools: { eslint: { precedence: ['project', 'nitpicker'] } } };

afterAll(() => {
  projects.remove();
});

describe('the nitpicker rules whose options the project config replaces', () => {
  it('are read from the ESLint checks nitpicker runs, with list rules and severities left out', () => {
    const root = projects.create({
      'eslint.config.mjs': `export default [{
  rules: {
    '@typescript-eslint/no-unused-vars': ['error', { args: 'none' }],
    'no-restricted-syntax': ['error', 'DebuggerStatement'],
    'no-console': 'warn',
    'no-alert': ['error'],
  },
}];
`,
      'src/a.ts': 'export const a = 1;\n',
    });

    expect(replacedEslintOptions(CONFIG, root)).toEqual({
      rules: ['@typescript-eslint/no-unused-vars'],
    });
  });

  it('report a config that does not load instead of listing nothing', () => {
    const root = projects.create({ 'eslint.config.mjs': 'export default [{ rules: {\n' });

    expect(replacedEslintOptions(CONFIG, root).error).toMatch(
      /^ESLint config eslint\.config\.mjs could not be loaded: .+$/su,
    );
  });
});
