import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { lintWithOxlint } from './oxlint-runner.mjs';

const packageRoot = path.resolve(import.meta.dirname, '../../../..');
const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-oxlint-react-')));
const adapters = 'src/main/features/profile/adapters';
const domain = 'src/main/features/profile/domain';
const ui = 'src/main/features/profile/ui';
const typedRules = new Set([
  'react-x/no-leaked-conditional-rendering',
  'nitpicker/react-no-effect-data-fetching',
]);

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

const preset = path.join(packageRoot, 'languages/typescript/preset');
const policy = [
  `import tseslint from ${JSON.stringify(import.meta.resolve('typescript-eslint'))};`,
  `import { reactScopeConfigFor } from ${JSON.stringify(`${preset}/eslint-config/react-scope.mjs`)};`,
  `import { strictSyntaxConfigFor } from ${JSON.stringify(`${preset}/eslint-config/strict.mjs`)};`,
  `import { resolveLayout } from ${JSON.stringify(`${preset}/layout.mjs`)};`,
  'const parserOptions = { project: true, tsconfigRootDir: import.meta.dirname };',
  'export default [',
  "  { files: ['**/*.{ts,tsx}'], languageOptions: { parser: tseslint.parser, parserOptions } },",
  '  ...strictSyntaxConfigFor(resolveLayout(), { react: true }),',
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
    include: ['src/**/*.ts', 'src/**/*.tsx'],
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
  [`${adapters}/player.tsx`]: [
    "import { useRef } from 'react';",
    'export function Player() {',
    '  const seen = useRef<Set<number> | null>(null);',
    '  if (seen.current === null) {',
    '    seen.current = new Set();',
    '  }',
    '  return <p>{seen.current.size}</p>;',
    '}',
  ],
  [`${ui}/banner.ts`]: [
    'export function showBanner(text: string) {',
    "  const banner = window.document.querySelector('#banner');",
    '  if (banner) banner.textContent = text;',
    '}',
  ],
  [`${domain}/required.ts`]: [
    "import React = require('react');",
    "const dom = require('react-dom');",
    'export const parts = [React, dom];',
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
    options: { projectRoot: root, patterns: ['src/**/*.ts', 'src/**/*.tsx'] },
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

const runs = new Map();

function oxlintRun() {
  if (!runs.has('project')) runs.set('project', lintedWithResidualRun());
  return runs.get('project');
}

function findingsOf(rule) {
  return oxlintRun().results.flatMap(({ filePath, messages }) =>
    messages
      .filter(({ ruleId }) => ruleId === rule)
      .map(({ line }) => `${path.relative(root, filePath)}:${String(line)}`),
  );
}

describe('the React rules under the oxlint engine', () => {
  it('send the typed rules to the residual ESLint pass and never crash oxlint', () => {
    const { results, residualRuns } = oxlintRun();

    expect(
      results.flatMap(({ messages }) => messages.filter(({ ruleId }) => ruleId === null)),
    ).toEqual([]);
    expect(residualRuns).toEqual([
      {
        files: [
          `${adapters}/badge.tsx`,
          `${adapters}/player.tsx`,
          `${adapters}/profile.tsx`,
          `${domain}/required.ts`,
          `${ui}/banner.ts`,
        ],
        rules: [...typedRules].toSorted(),
      },
    ]);
  });

  it('keep react out of domain/ through require and import = require', () => {
    expect(findingsOf('nitpicker/no-ui-framework-in-domain')).toEqual([
      `${domain}/required.ts:1`,
      `${domain}/required.ts:2`,
    ]);
  });

  it('report page DOM queries and content writes in ui/ files without JSX', () => {
    expect(findingsOf('nitpicker/react-no-direct-dom')).toEqual([
      `${ui}/banner.ts:2`,
      `${ui}/banner.ts:3`,
    ]);
  });

  it('let the lazy ref init through and report the ref read during render', () => {
    expect(findingsOf('react-x/refs')).toEqual([`${adapters}/player.tsx:7`]);
  });
});
