import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { vi } from 'vitest';
import { HEAD_POLICY_ENV } from '../../../../../shared/head-policy.mjs';
import { RULE_EXCEPTION_ENTRY } from '../../../preset/eslint-config/exceptions.mjs';
import { resolveHeadPolicy } from '../../../preset/head-policy.mjs';
import { LINT_CONFIG } from '../../../preset/test-environment/resolve-environment.mjs';
import { createProject } from '../../oxlint/test-support/oxlint-project.mjs';
import { runLintEngine } from '../lint-engine.mjs';

const TSESLINT = JSON.stringify(import.meta.resolve('typescript-eslint'));

const NAMED_IDENTIFIER_PLUGIN = `function named(name) {
  return {
    meta: { type: 'problem', schema: [], messages: { named: \`No \${name}.\` } },
    create(context) {
      return {
        Identifier(node) {
          if (node.name === name) context.report({ node, messageId: 'named' });
        },
      };
    },
  };
}
`;

const POLICY = `import tseslint from ${TSESLINT};
${NAMED_IDENTIFIER_PLUGIN}
const nitpicker = { rules: { 'no-foo': named('foo'), 'no-baz': named('baz') } };

export default [
  { ignores: ['src/vendor/**'] },
  {
    files: ['src/**/*.ts'],
    languageOptions: { parser: tseslint.parser },
    plugins: { nitpicker },
    rules: {
      'max-params': ['error', { max: 1 }],
      'no-console': 'error',
      'nitpicker/no-foo': 'error',
    },
  },
  { files: ['src/strict/**/*.ts'], linterOptions: { noInlineConfig: true } },
  { name: ${JSON.stringify(RULE_EXCEPTION_ENTRY)}, files: ['src/legacy/**'], rules: { 'max-params': 'off' } },
];
`;

const HOUSE_PLUGIN = `${NAMED_IDENTIFIER_PLUGIN}
export default { rules: { 'no-bar': named('bar') } };
`;

const PROJECT_CONFIG = `import house from './eslint/house.mjs';

export default [
  { ignores: ['src/generated/**', '!src/vendor/**'] },
  {
    files: ['src/**/*.ts'],
    languageOptions: { sourceType: 'script', parserOptions: { project: './missing.json' } },
    linterOptions: { noInlineConfig: false, reportUnusedDisableDirectives: 'off' },
    plugins: { house, nitpicker: house },
    rules: {
      'max-params': ['error', { max: 3 }],
      'no-console': 'off',
      'nitpicker/no-foo': ['off'],
      'nitpicker/no-baz': 'error',
      'house/no-bar': 'error',
      eqeqeq: 'error',
    },
  },
];
`;

export const SOURCES = {
  'policy.mjs': POLICY,
  'src/params.ts': 'export function pair(a: number, b: number) {\n  return a + b;\n}\n',
  'src/console.ts': "console.log('x');\nexport const foo = 1;\n",
  'src/named.ts': 'export const bar = 1;\nexport const baz = 2;\n',
  'src/equal.ts': 'export const same = (pair: [unknown, unknown]) => pair[0] == pair[1];\n',
  'src/legacy/old.ts':
    'export function legacy(a: number, b: number, c: number, d: number) {\n  return a + b + c + d;\n}\n',
  'src/generated/generated.ts': "console.log('generated');\n",
  'src/vendor/vendor.ts': "console.log('vendor');\n",
  'src/strict/locked.ts': "/* eslint-disable */\nconsole.log('locked');\n",
  'src/loose.ts': '// eslint-disable-next-line no-debugger\nexport const loose = 1;\n',
};

export const PROJECT_FILES = {
  'eslint.config.mjs': PROJECT_CONFIG,
  'eslint/house.mjs': HOUSE_PLUGIN,
};

export function temporaryProjects() {
  const roots = [];
  return {
    create(files) {
      const root = createProject('nitpicker-eslint-layer-', files);
      roots.push(root);
      return root;
    },
    remove() {
      for (const root of roots.splice(0)) {
        rmSync(root, { recursive: true, force: true });
      }
    },
  };
}

export function headPolicyFor({ engine, precedence, liveProjectRoot }) {
  const eslint = { engine, ...(precedence === undefined ? {} : { precedence }) };
  return resolveHeadPolicy({ tools: { eslint } }, liveProjectRoot);
}

export function lintLayered({
  projectRoot,
  liveProjectRoot = projectRoot,
  policy,
  configRelativePath = LINT_CONFIG,
}) {
  const directory = mkdtempSync(path.join(tmpdir(), 'nitpicker-eslint-layer-policy-'));
  try {
    writeFileSync(path.join(directory, 'policy.json'), JSON.stringify(policy));
    vi.stubEnv(HEAD_POLICY_ENV, path.join(directory, 'policy.json'));
    const results = runLintEngine({
      options: {
        projectRoot,
        liveProjectRoot,
        configRelativePath,
        patterns: ['src/**/*.ts'],
        timeoutMs: 120_000,
        environment: {},
      },
      policyConfigPath: path.join(projectRoot, 'policy.mjs'),
    });
    return results.flatMap((result) =>
      result.messages.map((message) => ({
        file: path.relative(projectRoot, result.filePath).replaceAll('\\', '/'),
        ruleId: message.ruleId ?? 'directive',
        line: message.line,
      })),
    );
  } finally {
    vi.unstubAllEnvs();
    rmSync(directory, { recursive: true, force: true });
  }
}
