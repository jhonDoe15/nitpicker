import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { lintWithOxlint } from './oxlint-runner.mjs';

const packageRoot = path.resolve(import.meta.dirname, '../../../..');
const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-oxlint-react-')));
const adapters = 'src/main/features/profile/adapters';
const typedRules = new Set([
  'react-x/no-leaked-conditional-rendering',
  'nitpicker/react-no-effect-data-fetching',
]);

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

const reactScope = path.join(
  packageRoot,
  'languages/typescript/preset/eslint-config/react-scope.mjs',
);
const layoutModule = path.join(packageRoot, 'languages/typescript/preset/layout.mjs');
const policy = [
  `import tseslint from ${JSON.stringify(import.meta.resolve('typescript-eslint'))};`,
  `import { reactScopeConfigFor } from ${JSON.stringify(reactScope)};`,
  `import { resolveLayout } from ${JSON.stringify(layoutModule)};`,
  'const parserOptions = { project: true, tsconfigRootDir: import.meta.dirname };',
  'export default [',
  "  { files: ['**/*.tsx'], languageOptions: { parser: tseslint.parser, parserOptions } },",
  '  ...(await reactScopeConfigFor(resolveLayout())),',
  '];',
];

const files = {
  'policy.mjs': policy,
  'package.json': JSON.stringify({
    name: 'app',
    type: 'module',
    dependencies: { react: '19.0.0' },
  }),
  'tsconfig.nitpicker.json': JSON.stringify({
    compilerOptions: {
      strict: true,
      jsx: 'react-jsx',
      module: 'NodeNext',
      skipLibCheck: true,
      types: [],
      lib: ['ES2022', 'DOM'],
    },
    include: ['src/**/*.tsx'],
  }),
  [`${adapters}/badge.tsx`]: [
    'export function Badge(props: { count: number }) {',
    '  return <div>{props.count && <p>new</p>}</div>;',
    '}',
  ],
  [`${adapters}/profile.tsx`]: [
    "import { useEffect } from 'react';",
    'declare function loadUser(): Promise<string>;',
    'export function Profile() {',
    '  useEffect(() => {',
    '    void loadUser();',
    '  }, []);',
    '  return <p>profile</p>;',
    '}',
  ],
};

for (const [file, contents] of Object.entries(files)) {
  mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  writeFileSync(
    path.join(root, file),
    Array.isArray(contents) ? `${contents.join('\n')}\n` : contents,
  );
}

function lintedWithResidualRun() {
  const residualRuns = [];
  const results = lintWithOxlint({
    options: { projectRoot: root, patterns: ['src/**/*.tsx'] },
    projectConfigPath: path.join(root, 'tsconfig.nitpicker.json'),
    environment: {
      ...process.env,
      NITPICKER_DIFF_ESLINT_POLICY_CONFIG: path.join(root, 'policy.mjs'),
      NITPICKER_DIFF_ESLINT_PROJECT_ROOT: root,
      NITPICKER_DIFF_ESLINT_PROJECT_CONFIG: path.join(root, 'tsconfig.nitpicker.json'),
    },
    runEslintCli: (patterns, environment) => {
      residualRuns.push({
        files: patterns,
        rules: JSON.parse(environment.NITPICKER_DIFF_ESLINT_ONLY_RULES),
      });
      return [];
    },
  });
  return { results, residualRuns };
}

describe('the typed React rules under the oxlint engine', () => {
  it('run in the residual ESLint pass, which has type information, and never crash oxlint', () => {
    const { results, residualRuns } = lintedWithResidualRun();

    expect(
      results.flatMap(({ messages }) => messages.filter(({ ruleId }) => ruleId === null)),
    ).toEqual([]);
    expect(residualRuns).toEqual([
      {
        files: [`${adapters}/badge.tsx`, `${adapters}/profile.tsx`],
        rules: [...typedRules].toSorted(),
      },
    ]);
  });
});
