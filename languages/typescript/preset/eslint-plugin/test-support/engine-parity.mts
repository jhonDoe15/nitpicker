import { rmSync } from 'node:fs';
import path from 'node:path';
import { ESLint } from 'eslint';
import { afterAll, describe, expect, it } from 'vitest';
import { checkoutModuleUrl } from '../../../../../shared/paths/checkout-module.mjs';
import { normalizeEslintResults } from '../../../adapters/eslint/normalize.mts';
import { lintWithOxlint } from '../../../adapters/oxlint/oxlint-runner.mts';
import { createProject } from '../../../adapters/oxlint/test-support/oxlint-project.mjs';

type PolicyKind = 'logic' | 'production-policy' | 'production-layout';

type Findings = ReturnType<typeof normalizeEslintResults>;

type ParityCase = { javascript: boolean; files: Record<string, string>; expected: string[] };

type ParityOptions = {
  title: string;
  itTitle: string;
  rule: string;
  prefix: string;
  policy: PolicyKind;
  environment: NodeJS.ProcessEnv;
  typeAwareFallback: boolean;
  cases: ParityCase[];
};

const FACTORIES: Record<PolicyKind, { module: string; factory: string; body: string }> = {
  logic: {
    module: '../../eslint-config/logic/logic-rules.mjs',
    factory: 'logicConfigFor',
    body: [
      'const files = [...layout.sourceGlobs, ...layout.testGlobs];',
      "const parserOptions = { project: './tsconfig.json', tsconfigRootDir: import.meta.dirname };",
      'const config = logicConfigFor(files, parserOptions);',
    ].join('\n'),
  },
  'production-policy': {
    module: '../../eslint-config/policy/production-policy.mjs',
    factory: 'productionPolicyConfigFor',
    body: 'const config = [...productionPolicyConfigFor(layout), testFiles];',
  },
  'production-layout': {
    module: '../../eslint-config/policy/production-policy.mjs',
    factory: 'productionLayoutConfigFor',
    body: 'const config = [...productionLayoutConfigFor(layout), testFiles];',
  },
};

const TSCONFIG = JSON.stringify({
  compilerOptions: { noEmit: true, types: [], lib: ['ES2023'], strict: true, allowJs: true },
  include: ['src', 'test'],
});

const PATTERNS = ['src/**/*.{ts,mjs}', 'test/**/*.{ts,mjs}'];

function policySource(kind: PolicyKind, javascript: boolean): string {
  const { module, factory, body } = FACTORIES[kind];
  const factoryModule = checkoutModuleUrl(new URL(module, import.meta.url)).href;
  const layoutModule = import.meta.resolve('../../layout.mjs');
  const dialect = import.meta.resolve('../../../../javascript/preset/eslint-dialect.mjs');
  return `import { ${factory} } from ${JSON.stringify(factoryModule)};
import { resolveLayout } from ${JSON.stringify(layoutModule)};
import { applyJavascriptDialect } from ${JSON.stringify(dialect)};

const layout = resolveLayout({}, [], { javascript: ${String(javascript)} });
const testFiles = { files: layout.testGlobs, rules: {} };
${body}
export default applyJavascriptDialect(config, {
  preset: ${javascript ? "'javascript'" : "'typescript'"},
});
`;
}

function findingsOf(root: string, results: unknown): Findings {
  return normalizeEslintResults({ value: results, projectRoot: root, analyzerName: 'eslint-lint' });
}

function eslintFor(root: string): ESLint {
  return new ESLint({ cwd: root, overrideConfigFile: path.join(root, 'policy.mjs') });
}

async function oxlintFindings(
  root: string,
  environment: NodeJS.ProcessEnv,
  runEslintCli: (files: readonly string[]) => unknown,
): Promise<Findings> {
  const results: unknown = await Reflect.apply(lintWithOxlint, undefined, [
    {
      options: { projectRoot: root, patterns: PATTERNS },
      environment: {
        ...environment,
        NITPICKER_DIFF_ESLINT_POLICY_CONFIG: path.join(root, 'policy.mjs'),
        NITPICKER_DIFF_ESLINT_PROJECT_ROOT: root,
      },
      runEslintCli,
    },
  ]);
  return findingsOf(root, results);
}

function located(findings: Findings, rule: string): string[] {
  return findings
    .filter((finding) => finding.rule === rule)
    .map(({ path: file, location }) => `${file}:${String(location?.line)}`)
    .sort((left, right) => left.localeCompare(right));
}

export function describeEngineParity(options: ParityOptions): void {
  describe.each(options.cases)(`${options.title} (javascript: $javascript)`, (parityCase) => {
    const root = createProject(options.prefix, {
      'policy.mjs': policySource(options.policy, parityCase.javascript),
      'tsconfig.json': TSCONFIG,
      ...parityCase.files,
    });
    afterAll(() => {
      rmSync(root, { recursive: true, force: true });
    });

    it(options.itTitle, async () => {
      const runEslintCli = options.typeAwareFallback
        ? (files: readonly string[]) => eslintFor(root).lintFiles([...files])
        : () => [];
      const [fromOxlint, fromEslint] = await Promise.all([
        oxlintFindings(root, options.environment, runEslintCli),
        eslintFor(root).lintFiles(PATTERNS),
      ]);
      expect(located(findingsOf(root, fromEslint), options.rule)).toEqual(parityCase.expected);
      expect(located(fromOxlint, options.rule)).toEqual(parityCase.expected);
    });
  });
}

export function bannedAndAllowedCase(options: {
  javascript: boolean;
  extension: string;
  banned: string;
  allowed: string;
  expectedFor: (bannedFiles: string[]) => string[];
}): ParityCase {
  const { extension, banned, allowed } = options;
  const bannedFiles = [`src/main/banned.${extension}`, `test/banned.test.${extension}`];
  return {
    javascript: options.javascript,
    files: {
      ...Object.fromEntries(bannedFiles.map((file) => [file, banned])),
      [`src/main/allowed.${extension}`]: allowed,
      [`test/allowed.test.${extension}`]: allowed,
    },
    expected: options.expectedFor(bannedFiles),
  };
}
