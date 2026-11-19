import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ESLint } from 'eslint';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { nativeConfigFlags } from '../../../typescript/adapters/lint-engine/compatibility/native-config.mts';

const checkout = path.join(import.meta.dirname, '../../../..');
const POLICY_CONFIG = path.join(checkout, 'languages/typescript/preset/defaults/eslint.config.mts');
const WRAPPER_CONFIG = path.join(
  checkout,
  'languages/typescript/adapters/eslint-wrapper.config.mts',
);
const EXECUTABLES = 'nitpicker/no-external-executables-in-unit-tests';
const SETUP_IMPORTS = 'nitpicker/no-production-imports-in-setup-files';
const RUN_GIT = [
  "import { execFileSync } from 'node:child_process';",
  "import { expect, it } from 'vitest';",
  "it('reads the status', () => { expect(execFileSync('git', ['status'])).toBe(''); });",
  '',
].join('\n');
const FILES = {
  'nitpicker.config.json': JSON.stringify({ preset: 'javascript' }),
  'package.json': JSON.stringify({ name: 'app', type: 'module', devDependencies: { vitest: '*' } }),
  'tsconfig.quality.json': JSON.stringify({
    compilerOptions: {
      allowJs: true,
      checkJs: true,
      noEmit: true,
      module: 'esnext',
      target: 'es2022',
      types: [],
      lib: ['ES2022'],
    },
    include: ['src', 'test'],
  }),
  'vitest.config.js': "export default { test: { setupFiles: ['./test/setup.js'] } };\n",
  'src/run.js': 'export const run = () => 1;\n',
  'test/setup.js': "import { run } from '../src/run.js';\nrun();\n",
  'test/unit/git.test.js': RUN_GIT,
  'test/integration/git.test.js': RUN_GIT,
  'test/unit/pure.test.js':
    "import { expect, it } from 'vitest';\nit('adds', () => { expect(1 + 1).toBe(2); });\n",
};

let root: string;
let ruleIdsByFile: Map<string, string[]>;

beforeAll(async () => {
  root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-javascript-tests-')));
  for (const [relativePath, text] of Object.entries(FILES)) {
    mkdirSync(path.dirname(path.join(root, relativePath)), { recursive: true });
    writeFileSync(path.join(root, relativePath), text);
  }
  vi.stubEnv('NITPICKER_DIFF_ESLINT_POLICY_CONFIG', POLICY_CONFIG);
  vi.stubEnv('NITPICKER_DIFF_ESLINT_PROJECT_ROOT', root);
  vi.stubEnv('NITPICKER_DIFF_ESLINT_PROJECT_CONFIG', '');
  vi.stubEnv('NITPICKER_POLICY', path.join(root, 'nitpicker.config.json'));
  const eslint = new ESLint({
    cwd: root,
    overrideConfigFile: WRAPPER_CONFIG,
    flags: nativeConfigFlags(WRAPPER_CONFIG),
  });
  const results = await eslint.lintFiles(['test/**/*.js']);
  ruleIdsByFile = new Map(
    results.map(({ filePath, messages }) => [
      path.relative(root, filePath),
      messages.flatMap(({ ruleId }) => (ruleId === null ? [] : [ruleId])),
    ]),
  );
});

afterAll(() => {
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});

function reported(file: string, rule: string): string[] {
  return (ruleIdsByFile.get(file) ?? []).filter((ruleId) => ruleId === rule);
}

describe('test rules that need no types, in the JavaScript preset', () => {
  it('flags a unit test that runs an external executable', () => {
    expect(reported('test/unit/git.test.js', EXECUTABLES)).toEqual([EXECUTABLES]);
  });

  it('allows the same test in the integration folder and a unit test that runs none', () => {
    expect([
      ...reported('test/integration/git.test.js', EXECUTABLES),
      ...reported('test/unit/pure.test.js', EXECUTABLES),
    ]).toEqual([]);
  });

  it('flags a setup file that imports production code', () => {
    expect(reported('test/setup.js', SETUP_IMPORTS)).toEqual([SETUP_IMPORTS]);
  });

  it('allows a test file to import production code', () => {
    expect(reported('test/unit/pure.test.js', SETUP_IMPORTS)).toEqual([]);
  });
});
