import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ESLint } from 'eslint';
import tseslint from 'typescript-eslint';
import { containedPath } from '../../../../../core/fix/common/contained-path.mjs';
import { suggestionRules } from '../suggestion-rules.mjs';

const TSCONFIG = {
  compilerOptions: { strict: true, target: 'es2022', module: 'nodenext', noEmit: true },
  include: ['src'],
};

async function writeProject(root, cases) {
  await writeFile(containedPath(root, 'tsconfig.json'), JSON.stringify(TSCONFIG));
  await writeFile(containedPath(root, 'package.json'), '{"type":"module"}');
  await mkdir(containedPath(root, 'src'));
  const files = new Map();
  for (const [index, [name, source]] of Object.entries(cases).entries()) {
    const file = `src/case${index}.ts`;
    files.set(name, containedPath(root, file));
    await writeFile(containedPath(root, file), source);
  }
  return files;
}

function eslintFor(root) {
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
        plugins: { '@typescript-eslint': tseslint.plugin },
        rules: Object.fromEntries(Object.keys(suggestionRules).map((rule) => [rule, 'error'])),
      },
    ],
  });
}

export async function lintCases(cases) {
  const root = await mkdtemp(path.join(tmpdir(), 'nitpicker-suggestions-'));
  try {
    const files = await writeProject(root, cases);
    const results = await eslintFor(root).lintFiles(['src']);
    return new Map(
      [...files].map(([name, file]) => [
        name,
        results.find(({ filePath }) => filePath === file).messages,
      ]),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
