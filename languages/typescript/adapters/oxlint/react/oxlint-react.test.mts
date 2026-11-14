import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { lintWithOxlint } from '../oxlint-runner.mts';
import type { LintResult } from '../plan/oxlint-shapes.mts';
import { oxlintOptions, residualRecorder, type ResidualRun } from '../test-support/oxlint-runs.mts';
import { writeFileTree } from '../../test-support/file-tree.mts';

const packageRoot = path.resolve(import.meta.dirname, '../../../../..');
const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-oxlint-react-')));
const adapters = 'src/main/features/profile/adapters';
const domain = 'src/main/features/profile/domain';
const ui = 'src/main/features/profile/ui';
const typedRules = new Set([
  'nitpicker/no-unknown-in-domain',
  'react-x/no-leaked-conditional-rendering',
]);

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

const preset = path.join(packageRoot, 'languages/typescript/preset');
const policy = [
  `import tseslint from ${JSON.stringify(import.meta.resolve('typescript-eslint'))};`,
  `import { reactScopeConfigFor } from ${JSON.stringify(`${preset}/eslint-config/react/react-scope.mjs`)};`,
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
      lib: ['ES2022'],
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
  [`${adapters}/signup.tsx`]: [
    "import { useEffect } from 'react';",
    'export function Signup(props: { onChange: (v: string) => void; value: string }) {',
    '  const { onChange, value } = props;',
    '  useEffect(() => {',
    '    onChange(value);',
    '  }, [value]);',
    '  const id = crypto.randomUUID();',
    '  return <ul><li key={id}><input id="email" defaultValue={value} /></li></ul>;',
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

writeFileTree(root, files);

async function lintedWithResidualRun() {
  const { runs: residualRuns, runEslintCli } = residualRecorder();
  const results = await lintWithOxlint({
    options: oxlintOptions(root, ['src/**/*.ts', 'src/**/*.tsx']),
    projectConfigPath: path.join(root, 'tsconfig.nitpicker.json'),
    environment: {
      ...process.env,
      NITPICKER_DIFF_ESLINT_POLICY_CONFIG: path.join(root, 'policy.mjs'),
      NITPICKER_DIFF_ESLINT_PROJECT_ROOT: root,
      NITPICKER_DIFF_ESLINT_PROJECT_CONFIG: path.join(root, 'tsconfig.nitpicker.json'),
    },
    runEslintCli,
  });
  return { results, residualRuns };
}

const OXLINT_TIMEOUT_MS = 30_000;

describe('the React rules under the oxlint engine', () => {
  let run: { results: LintResult[]; residualRuns: ResidualRun[] };

  beforeAll(async () => {
    run = await lintedWithResidualRun();
  }, OXLINT_TIMEOUT_MS);

  function findingsOf(rule: string) {
    return run.results.flatMap(({ filePath, messages }) =>
      messages
        .filter(({ ruleId }) => ruleId === rule)
        .map(({ line }) => `${path.relative(root, filePath)}:${String(line)}`),
    );
  }

  it('send the typed rules to the residual ESLint pass and never crash oxlint', () => {
    const { results, residualRuns } = run;

    expect(
      results.flatMap(({ messages }) => messages.filter(({ ruleId }) => ruleId === undefined)),
    ).toEqual([]);
    expect(residualRuns).toEqual([
      {
        files: [
          `${adapters}/badge.tsx`,
          `${adapters}/player.tsx`,
          `${adapters}/profile.tsx`,
          `${adapters}/signup.tsx`,
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

  it.each([
    ['nitpicker/react-no-effect-event-handling', 5],
    ['nitpicker/react-no-random-key', 8],
    ['nitpicker/react-field-has-label', 8],
  ])(
    'report %s through destructured props, a generated const and an unmatched id',
    (rule, line) => {
      expect(findingsOf(rule)).toEqual([`${adapters}/signup.tsx:${String(line)}`]);
    },
  );
});
