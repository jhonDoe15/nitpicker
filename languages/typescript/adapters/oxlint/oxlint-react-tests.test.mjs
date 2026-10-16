import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { lintWithOxlint } from './oxlint-runner.mjs';

const packageRoot = path.resolve(import.meta.dirname, '../../../..');
const preset = path.join(packageRoot, 'languages/typescript/preset');
const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-oxlint-react-tests-')));
const checkedRules = new Set([
  'nitpicker/react-test-no-implementation-details',
  'nitpicker/test-must-use-production-runtime',
  'testing-library/no-test-id-queries',
  'testing-library/prefer-user-event-setup',
]);

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

const policy = [
  `import tseslint from ${JSON.stringify(import.meta.resolve('typescript-eslint'))};`,
  `import { nitpickerRules } from ${JSON.stringify(`${preset}/eslint-plugin/index.mjs`)};`,
  `import { reactScopeConfigFor } from ${JSON.stringify(`${preset}/eslint-config/react/react-scope.mjs`)};`,
  `import { resolveLayout } from ${JSON.stringify(`${preset}/layout.mjs`)};`,
  'export default [',
  "  { files: ['**/*.{ts,tsx}'], languageOptions: { parser: tseslint.parser } },",
  '  ...(await reactScopeConfigFor(resolveLayout())),',
  '  {',
  "    files: ['test/**/*.{ts,tsx}'],",
  '    plugins: { nitpicker: nitpickerRules },',
  "    rules: { 'nitpicker/test-must-use-production-runtime': 'error' },",
  '  },',
  '];',
];

const files = {
  'policy.mjs': policy,
  'package.json': [JSON.stringify({ name: 'app', dependencies: { react: '19.0.0' } })],
  'tsconfig.json': [
    JSON.stringify({
      compilerOptions: { types: [], lib: ['ES2022'], paths: { '@/*': ['./src/*'] } },
    }),
  ],
  'src/main/ui/app.tsx': ['export function App() { return <main />; }'],
  'test/support/render-app.tsx': [
    "import { render } from '@testing-library/react';",
    "import { App } from '@/main/ui/app.js';",
    'export function renderApp() { return render(<App />); }',
  ],
  'test/support/index.ts': ["export * from './render-app.js';"],
  'test/ui/through-chain.test.ts': [
    "import { renderApp } from '../support/index.js';",
    "renderApp().getByTestId('save');",
  ],
  'test/ui/mocked-react.test.ts': [
    "import { App } from '../../src/main/ui/app.js';",
    "vi.mock('react', () => ({ useState: vi.fn() }));",
    'App();',
  ],
  'test/ui/store.test.tsx': [
    "import { render } from '@testing-library/react';",
    "import { App } from '../../src/main/ui/app.js';",
    'render(<App />);',
    'useStore.setState({ count: 0 });',
  ],
  'test/ui/namespace-event.test.tsx': [
    "import * as UE from '@testing-library/user-event';",
    "import { render, screen } from '@testing-library/react';",
    "import { App } from '../../src/main/ui/app.js';",
    "it('clicks', async () => { render(<App />); await UE.userEvent.click(screen.getByRole('button')); });",
  ],
};

for (const [file, lines] of Object.entries(files)) {
  mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  writeFileSync(path.join(root, file), `${lines.join('\n')}\n`);
}

describe('the React test rules under the oxlint engine', () => {
  it('follow helpers, mocks of react, enzyme-only state checks and namespace user-event', () => {
    const results = lintWithOxlint({
      options: { projectRoot: root, patterns: ['test/**/*.ts', 'test/**/*.tsx'] },
      environment: {
        ...process.env,
        NITPICKER_DIFF_ESLINT_POLICY_CONFIG: path.join(root, 'policy.mjs'),
        NITPICKER_DIFF_ESLINT_PROJECT_ROOT: root,
      },
      runEslintCli: () => [],
    });

    expect(
      results.flatMap(({ filePath, messages }) =>
        messages
          .filter(({ ruleId }) => ruleId === null || checkedRules.has(ruleId))
          .map(({ ruleId, line }) => `${path.relative(root, filePath)}:${String(line)} ${ruleId}`),
      ),
    ).toEqual([
      'test/ui/mocked-react.test.ts:2 nitpicker/react-test-no-implementation-details',
      'test/ui/namespace-event.test.tsx:4 testing-library/prefer-user-event-setup',
      'test/ui/through-chain.test.ts:2 testing-library/no-test-id-queries',
    ]);
  });
});
