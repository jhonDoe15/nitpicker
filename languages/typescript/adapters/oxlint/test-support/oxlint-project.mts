import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { lintWithOxlint } from '../oxlint-runner.mts';
import { type LintProjectRequest, oxlintOptions } from './oxlint-runs.mts';

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

export function createProject(prefix: string, files: Readonly<Record<string, string>>): string {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), prefix)));
  for (const [relativePath, text] of Object.entries(files)) {
    const target = path.resolve(root, relativePath);
    if (!target.startsWith(`${root}${path.sep}`)) {
      throw new Error(`Test project file is outside the project: ${relativePath}`);
    }
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, text);
  }
  return root;
}

function noResidualRun(): never {
  throw new Error('no rule needs ESLint here');
}

export function lintProject(request: LintProjectRequest): ReturnType<typeof lintWithOxlint> {
  const { root, patterns, projectConfigName, runEslintCli = noResidualRun } = request;
  const projectConfigPath =
    projectConfigName === undefined ? undefined : path.join(root, projectConfigName);
  return lintWithOxlint({
    options: oxlintOptions(root, patterns),
    projectConfigPath,
    environment: {
      ...process.env,
      NITPICKER_DIFF_ESLINT_POLICY_CONFIG: path.join(root, 'policy.mjs'),
      NITPICKER_DIFF_ESLINT_PROJECT_ROOT: root,
      ...(projectConfigPath === undefined
        ? {}
        : { NITPICKER_DIFF_ESLINT_PROJECT_CONFIG: projectConfigPath }),
    },
    runEslintCli,
  });
}
