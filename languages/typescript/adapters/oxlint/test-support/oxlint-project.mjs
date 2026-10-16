import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { lintWithOxlint } from '../oxlint-runner.mjs';

export const TYPED_POLICY = `import tseslint from ${JSON.stringify(import.meta.resolve('typescript-eslint'))};

export default [
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { project: './tsconfig.json', tsconfigRootDir: import.meta.dirname },
    },
    plugins: { '@typescript-eslint': tseslint.plugin },
    rules: { '@typescript-eslint/no-unnecessary-type-assertion': 'error' },
  },
];
`;

export function createProject(prefix, files) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), prefix)));
  for (const [relativePath, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, relativePath)), { recursive: true });
    writeFileSync(path.join(root, relativePath), text);
  }
  return root;
}

export function lintProject({ root, patterns, projectConfigName }) {
  const projectConfigPath =
    projectConfigName === undefined ? undefined : path.join(root, projectConfigName);
  return lintWithOxlint({
    options: { projectRoot: root, patterns },
    projectConfigPath,
    environment: {
      ...process.env,
      NITPICKER_DIFF_ESLINT_POLICY_CONFIG: path.join(root, 'policy.mjs'),
      NITPICKER_DIFF_ESLINT_PROJECT_ROOT: root,
      ...(projectConfigPath === undefined
        ? {}
        : { NITPICKER_DIFF_ESLINT_PROJECT_CONFIG: projectConfigPath }),
    },
    runEslintCli: () => {
      throw new Error('no rule needs ESLint here');
    },
  });
}
