import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { lintWithOxlint } from './oxlint-runner.mjs';

const RULES_URL = import.meta.resolve('../../preset/eslint-plugin/rules');

function ruleUrl(path) {
  return JSON.stringify(`${RULES_URL}/${path}`);
}

const EXCEPTION = 'add an exception for this rule in nitpicker.config.json.';

const POLICY = `import tseslint from ${JSON.stringify(import.meta.resolve('typescript-eslint'))};
import { rule as singularAndPlural } from ${ruleUrl('react-props/no-singular-and-plural-prop.mjs')};

const nitpicker = {
  rules: {
    'no-singular-and-plural-prop': singularAndPlural,
  },
};

export default [
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { parser: tseslint.parser },
    plugins: { nitpicker },
    rules: {
      'nitpicker/no-singular-and-plural-prop': 'error',
    },
  },
];
`;

const SOURCES = {
  'src/Panel.tsx': [
    'export type PanelProps = { field?: string; fields?: string[] };',
    'export function Panel(props: PanelProps) {',
    '  return <div />;',
    '}',
  ].join('\n'),
};

const EXPECTED = {
  'src/Panel.tsx': [
    [
      'nitpicker/no-singular-and-plural-prop',
      `Optional props \`field\` and \`fields\` are two ways to pass the same data. Keep \`fields\` and pass a single item as a one-element array. If both props are intended, ${EXCEPTION}`,
    ],
  ],
};

let root;
let results;
let residualRules;

function recordResidualRules(files, extraEnvironment) {
  residualRules = JSON.parse(extraEnvironment.NITPICKER_DIFF_ESLINT_ONLY_RULES);
  return [];
}

beforeAll(() => {
  root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-oxlint-messages-')));
  const files = {
    'policy.mjs': POLICY,
    ...SOURCES,
  };
  for (const [relativePath, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, relativePath)), { recursive: true });
    writeFileSync(path.join(root, relativePath), text);
  }
  const environment = {
    ...process.env,
    NITPICKER_DIFF_ESLINT_POLICY_CONFIG: path.join(root, 'policy.mjs'),
    NITPICKER_DIFF_ESLINT_PROJECT_ROOT: root,
  };
  results = lintWithOxlint({
    options: { projectRoot: root, patterns: ['src/**/*.{ts,tsx}'] },
    environment,
    runEslintCli: recordResidualRules,
  });
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('nitpicker rule messages through the oxlint engine', () => {
  it.each(Object.entries(EXPECTED))('keeps the full message text in %s', (file, expected) => {
    const messages = results
      .find((entry) => entry.filePath === path.join(root, file))
      .messages.map(({ ruleId, message }) => [ruleId, message]);

    expect(messages).toEqual(expected);
  });

  it('runs no ESLint residual pass when no rule needs the type checker', () => {
    expect(residualRules).toBeUndefined();
  });
});
