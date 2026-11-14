import { rmSync } from 'node:fs';
import path from 'node:path';
import { ESLint } from 'eslint';
import { afterAll, describe, expect, it } from 'vitest';
import { normalizeEslintResults } from '../../../../adapters/eslint/normalize.mjs';
import { lintWithOxlint } from '../../../../adapters/oxlint/oxlint-runner.mjs';
import { createProject } from '../../../../adapters/oxlint/test-support/oxlint-project.mjs';

const RULE = 'nitpicker/no-repeated-string-literal';
const PATTERNS = ['src/**/*.{ts,mjs}', 'test/**/*.{ts,mjs}'];

function policy({ javascript }) {
  const production = import.meta.resolve('../../../eslint-config/policy/production-policy.mjs');
  const layoutModule = import.meta.resolve('../../../layout.mjs');
  const dialect = import.meta.resolve('../../../../../javascript/preset/eslint-dialect.mjs');
  return `import { productionPolicyConfigFor } from ${JSON.stringify(production)};
import { resolveLayout } from ${JSON.stringify(layoutModule)};
import { applyJavascriptDialect } from ${JSON.stringify(dialect)};

const layout = resolveLayout({}, [], { javascript: ${String(javascript)} });
const testFiles = { files: layout.testGlobs, rules: {} };
export default applyJavascriptDialect([...productionPolicyConfigFor(layout), testFiles], {
  preset: ${javascript ? "'javascript'" : "'typescript'"},
});
`;
}

const BANNED = [
  'export function describe(code: string): string {',
  '  if (code === "order not found") {',
  '    return "order not found";',
  '  }',
  '  return code + "order not found";',
  '}',
].join('\n');

const BANNED_LINES = [5];

const ALLOWED = [
  'const NOT_FOUND = "order not found";',
  'export function describe(code: string): string {',
  '  if (code === NOT_FOUND) {',
  '    return NOT_FOUND;',
  '  }',
  `  return \`\${code}\${NOT_FOUND}\`;`,
  '}',
].join('\n');

const TSCONFIG = JSON.stringify({
  compilerOptions: { noEmit: true, types: [], lib: ['ES2023'], strict: true, allowJs: true },
  include: ['src', 'test'],
});

const roots = [];

afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

function project(files, { javascript }) {
  const root = createProject('nitpicker-repeated-string-', {
    'policy.mjs': policy({ javascript }),
    'tsconfig.json': TSCONFIG,
    ...files,
  });
  roots.push(root);
  return root;
}

function findingsOf(root, results) {
  return normalizeEslintResults({ value: results, projectRoot: root, analyzerName: 'eslint-lint' });
}

async function eslintFindings(root) {
  const eslint = new ESLint({ cwd: root, overrideConfigFile: path.join(root, 'policy.mjs') });
  return findingsOf(root, await eslint.lintFiles(PATTERNS));
}

async function oxlintFindings(root) {
  const results = await lintWithOxlint({
    options: { projectRoot: root, patterns: PATTERNS },
    environment: {
      ...process.env,
      NITPICKER_DIFF_ESLINT_POLICY_CONFIG: path.join(root, 'policy.mjs'),
      NITPICKER_DIFF_ESLINT_PROJECT_ROOT: root,
    },
    runEslintCli: () => [],
  });
  return findingsOf(root, results);
}

function located(findings) {
  return findings
    .filter(({ rule }) => rule === RULE)
    .map(({ path: file, location }) => `${file}:${String(location.line)}`)
    .sort((left, right) => left.localeCompare(right));
}

describe.each([
  { javascript: false, extension: 'ts', banned: BANNED, allowed: ALLOWED },
  {
    javascript: true,
    extension: 'mjs',
    banned: BANNED.replaceAll(': string', ''),
    allowed: ALLOWED.replaceAll(': string', ''),
  },
])(
  'repeated string literals (javascript: $javascript)',
  ({ javascript, extension, banned, allowed }) => {
    const root = project(
      {
        [`src/main/banned.${extension}`]: banned,
        'test/banned.test.mjs': banned.replaceAll(': string', ''),
        [`src/main/allowed.${extension}`]: allowed,
      },
      { javascript },
    );

    it('reports the third use in production code only, on both engines', async () => {
      const [fromOxlint, fromEslint] = await Promise.all([
        oxlintFindings(root),
        eslintFindings(root),
      ]);
      const expected = BANNED_LINES.map((line) => `src/main/banned.${extension}:${String(line)}`);
      expect(located(fromEslint)).toEqual(expected);
      expect(located(fromOxlint)).toEqual(expected);
    });
  },
);
