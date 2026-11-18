import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ESLint } from 'eslint';
import regexp from 'eslint-plugin-regexp';
import tseslint from 'typescript-eslint';
import { messageOf } from '../../typed/eslint-report.mts';
import { containedPath } from '../../../../../core/fix/typed/fix-views.mts';
import { suggestionRules, type LintMessage } from '../typed/suggestion-views.mts';

const TSCONFIG = {
  compilerOptions: { strict: true, target: 'es2022', module: 'nodenext', noEmit: true },
  include: ['src'],
};

async function writeProject(
  root: string,
  cases: Readonly<Record<string, string>>,
): Promise<Map<string, string>> {
  await writeFile(containedPath(root, 'tsconfig.json'), JSON.stringify(TSCONFIG));
  await writeFile(containedPath(root, 'package.json'), '{"type":"module"}');
  await mkdir(containedPath(root, 'src'));
  const files = new Map();
  for (const [index, [name, source]] of Object.entries(cases).entries()) {
    const file = `src/case${String(index)}.ts`;
    files.set(name, containedPath(root, file));
    await writeFile(containedPath(root, file), source);
  }
  return files;
}

function eslintFor(root: string): ESLint {
  return new ESLint({
    cwd: root,
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ['**/*.ts'],
        languageOptions: {
          parser: tseslint.parser,
          parserOptions: { project: './tsconfig.json', tsconfigRootDir: root },
        },
        plugins: { '@typescript-eslint': tseslint.plugin, regexp },
        rules: Object.fromEntries(Object.keys(suggestionRules).map((rule) => [rule, 'error'])),
      },
    ],
  });
}

export async function lintCases(
  cases: Readonly<Record<string, string>>,
): Promise<Map<string, readonly LintMessage[]>> {
  const root = await mkdtemp(path.join(tmpdir(), 'nitpicker-suggestions-'));
  try {
    const files = await writeProject(root, cases);
    const results = await eslintFor(root).lintFiles(['src']);
    return new Map(
      [...files].map(([name, file]): [string, readonly LintMessage[]] => [
        name,
        (results.find(({ filePath }) => filePath === file)?.messages ?? []).map(messageOf),
      ]),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
