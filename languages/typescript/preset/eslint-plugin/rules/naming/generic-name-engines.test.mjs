import { rmSync } from 'node:fs';
import path from 'node:path';
import { ESLint } from 'eslint';
import { afterAll, describe, expect, it } from 'vitest';
import { normalizeEslintResults } from '../../../../adapters/eslint/normalize.mjs';
import { lintWithOxlint } from '../../../../adapters/oxlint/oxlint-runner.mjs';
import { createProject } from '../../../../adapters/oxlint/test-support/oxlint-project.mjs';

const RULE = 'nitpicker/no-generic-name';
const PATTERNS = ['src/**/*.{ts,mjs}', 'test/**/*.{ts,mjs}'];

function policy({ javascript }) {
  const production = import.meta.resolve('../../../eslint-config/policy/production-policy.mjs');
  const layoutModule = import.meta.resolve('../../../layout.mjs');
  const dialect = import.meta.resolve('../../../../../javascript/preset/eslint-dialect.mjs');
  return `import { productionLayoutConfigFor } from ${JSON.stringify(production)};
import { resolveLayout } from ${JSON.stringify(layoutModule)};
import { applyJavascriptDialect } from ${JSON.stringify(dialect)};

const layout = resolveLayout({}, [], { javascript: ${String(javascript)} });
const testFiles = { files: layout.testGlobs, rules: {} };
export default applyJavascriptDialect([...productionLayoutConfigFor(layout), testFiles], {
  preset: ${javascript ? "'javascript'" : "'typescript'"},
});
`;
}

const TYPE = 'export class OrderHelper {}\n';
const PLAIN = 'export const rate = 1;\n';
const ALLOWED = 'export class PriceRounder {}\nexport class CacheManager {}\n';

const BANNED_FILES = (extension) => ({
  [`src/main/string-utils.${extension}`]: PLAIN,
  [`src/main/common/rates.${extension}`]: PLAIN,
  [`src/main/orders.${extension}`]: TYPE,
});

const EXPECTED = (extension) => [
  `src/main/common/rates.${extension}:1`,
  `src/main/orders.${extension}:1`,
  `src/main/string-utils.${extension}:1`,
];

const TSCONFIG = JSON.stringify({
  compilerOptions: { noEmit: true, types: [], lib: ['ES2023'], strict: true, allowJs: true },
  include: ['src', 'test'],
});

const roots = [];

afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

function project(files, { javascript }) {
  const root = createProject('nitpicker-generic-name-', {
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
  { javascript: false, extension: 'ts' },
  { javascript: true, extension: 'mjs' },
])('generic names (javascript: $javascript)', ({ javascript, extension }) => {
  const root = project(
    {
      ...BANNED_FILES(extension),
      [`src/main/price-rounding.${extension}`]: ALLOWED,
      'test/helpers/utils.mjs': TYPE,
    },
    { javascript },
  );

  it('reports files, folders and types in production code only, on both engines', async () => {
    const [fromOxlint, fromEslint] = await Promise.all([
      oxlintFindings(root),
      eslintFindings(root),
    ]);
    expect(located(fromEslint)).toEqual(EXPECTED(extension));
    expect(located(fromOxlint)).toEqual(EXPECTED(extension));
  });
});
