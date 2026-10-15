import { ESLint } from 'eslint';
import accessibility from 'eslint-plugin-jsx-a11y-x';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import tseslint from 'typescript-eslint';
import { afterEach, describe, expect, it } from 'vitest';
import { lintFixture } from '../failure-messages/harness.mjs';
import { resolveLayout } from '../layout.mjs';
import {
  accessibilityRuleNames,
  reactRuleIds,
  reactTestRuleIds,
  testingLibraryHints,
} from './react-rules.mjs';
import {
  analyzedProjectRoot,
  isReactProject,
  reactScopeConfigFor,
  reactSyntaxConfigFor,
  stylingApproachFor,
} from './react-scope.mjs';

const layout = resolveLayout();
const temporaryRoots = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function projectWith(manifest) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-react-scope-'));
  temporaryRoots.push(root);
  if (manifest !== undefined) {
    writeFileSync(path.join(root, 'package.json'), manifest);
  }
  return root;
}

function manifestWith(fields) {
  return JSON.stringify({ name: 'app', ...fields });
}

describe('React detection', () => {
  it.each([
    ['dependencies', { dependencies: { react: '19.0.0' } }],
    ['devDependencies', { devDependencies: { react: '19.0.0' } }],
    ['both', { dependencies: { react: '19.0.0' }, devDependencies: { react: '19.0.0' } }],
  ])('turns on when react is in %s', (_name, fields) => {
    const projectRoot = projectWith(manifestWith(fields));

    expect(isReactProject({ projectRoot })).toBe(true);
  });

  it.each([
    ['no manifest', undefined],
    ['a manifest without dependencies', manifestWith({})],
    ['other dependencies only', manifestWith({ dependencies: { preact: '10.0.0' } })],
    ['react only as a peer dependency', manifestWith({ peerDependencies: { react: '19.0.0' } })],
    ['react-dom without react', manifestWith({ dependencies: { 'react-dom': '19.0.0' } })],
    ['a malformed manifest', '{ not json'],
    ['a manifest that is JSON null', 'null'],
    ['a manifest that is a JSON number', '5'],
  ])('stays off with %s', (_name, manifest) => {
    const projectRoot = projectWith(manifest);

    expect(isReactProject({ projectRoot })).toBe(false);
  });

  it('lets the config switch the scope on or off whatever package.json says', () => {
    const withReact = projectWith(manifestWith({ dependencies: { react: '19.0.0' } }));
    const withoutReact = projectWith(manifestWith({}));

    expect(isReactProject({ projectRoot: withReact, react: { enabled: false } })).toBe(false);
    expect(isReactProject({ projectRoot: withoutReact, react: { enabled: true } })).toBe(true);
    expect(isReactProject({ projectRoot: withReact, react: { styling: 'css-in-js' } })).toBe(true);
    expect(isReactProject({ projectRoot: withoutReact, react: {} })).toBe(false);
  });

  it('reads the analyzed project from the ESLint wrapper environment, else the working directory', () => {
    expect(analyzedProjectRoot({ NITPICKER_DIFF_ESLINT_PROJECT_ROOT: '/analyzed' })).toBe(
      '/analyzed',
    );
    expect(analyzedProjectRoot({})).toBe(process.cwd());
  });
});

async function calculatedConfig(entries, file) {
  const eslint = new ESLint({
    cwd: path.resolve(import.meta.dirname, '../defaults'),
    overrideConfigFile: true,
    overrideConfig: [{ languageOptions: { parser: tseslint.parser } }, ...entries],
  });
  return eslint.calculateConfigForFile(file);
}

describe('the styling approach', () => {
  it.each([
    ['styled-components', { dependencies: { 'styled-components': '6.0.0' } }],
    ['an @emotion package', { devDependencies: { '@emotion/react': '11.0.0' } }],
    ['another CSS-in-JS library', { dependencies: { goober: '2.0.0' } }],
  ])('is css-in-js when the manifest lists %s', (_name, fields) => {
    const projectRoot = projectWith(manifestWith({ dependencies: { react: '19.0.0' }, ...fields }));

    expect(stylingApproachFor({ projectRoot })).toBe('css-in-js');
  });

  it.each([
    [
      'no CSS-in-JS dependency',
      manifestWith({ dependencies: { react: '19.0.0', tailwindcss: '4.0.0' } }),
    ],
    [
      'a similarly named package',
      manifestWith({ dependencies: { 'styled-components-extra': '1.0.0' } }),
    ],
    ['no manifest', undefined],
  ])('is class-names with %s', (_name, manifest) => {
    expect(stylingApproachFor({ projectRoot: projectWith(manifest) })).toBe('class-names');
  });

  it('lets the config override what the manifest suggests', () => {
    const projectRoot = projectWith(
      manifestWith({ dependencies: { 'styled-components': '6.0.0' } }),
    );

    expect(stylingApproachFor({ projectRoot, react: { styling: 'inline-style' } })).toBe(
      'inline-style',
    );
    expect(stylingApproachFor({ projectRoot, react: { enabled: true } })).toBe('css-in-js');
  });

  it('reaches the styling rule through the scope config', async () => {
    const projectRoot = projectWith(
      manifestWith({ dependencies: { '@emotion/styled': '11.0.0' } }),
    );

    const [entry] = await reactScopeConfigFor(layout, {}, projectRoot);

    expect(entry.rules['nitpicker/react-single-styling-approach']).toEqual([
      'error',
      { approach: 'css-in-js' },
    ]);
  });
});

describe('the React scope config', () => {
  it('configures exactly the listed React rule ids', async () => {
    const [production, tests] = await reactSyntaxConfigFor(layout);

    expect(Object.keys(production.rules).toSorted()).toEqual(reactRuleIds.toSorted());
    expect(Object.keys(tests.rules).toSorted()).toEqual(reactTestRuleIds.toSorted());
  });

  it('registers an implementation for every plugin rule it configures', async () => {
    for (const entry of await reactSyntaxConfigFor(layout)) {
      for (const id of Object.keys(entry.rules)) {
        const [pluginName, ...rest] = id.split('/');
        expect(entry.plugins[pluginName].rules[rest.join('/')], id).toBeDefined();
      }
    }
  });

  it('runs every rule as an error', async () => {
    for (const entry of await reactSyntaxConfigFor(layout)) {
      for (const [id, setting] of Object.entries(entry.rules)) {
        expect([setting].flat()[0], id).toBe('error');
      }
    }
  });

  it('gives every Testing Library rule a hint naming the allowed form', async () => {
    const { testingLibraryPlugin } = await import('./react-plugins.mjs');

    expect(Object.keys(testingLibraryPlugin.rules).toSorted()).toEqual(
      Object.keys(testingLibraryHints).toSorted(),
    );
    for (const [name, hint] of Object.entries(testingLibraryHints)) {
      const messages = Object.values(testingLibraryPlugin.rules[name].meta.messages);
      expect(messages.length, name).toBeGreaterThan(0);
      for (const message of messages) {
        expect(message.endsWith(hint), name).toBe(true);
      }
    }
  });

  it('lists the accessibility rules the plugin recommends, and only those', () => {
    const recommended = Object.entries(accessibility.configs.recommended.rules)
      .filter(([, setting]) => [setting].flat()[0] !== 'off')
      .map(([id]) => id.replace('jsx-a11y-x/', ''));

    expect(accessibilityRuleNames.toSorted()).toEqual(recommended.toSorted());
  });

  it('defaults to class names and passes the configured styling approach to the rule', async () => {
    const [fallback] = await reactSyntaxConfigFor(layout);
    const [configured] = await reactSyntaxConfigFor(layout, { styling: 'inline-style' });
    const [explicit] = await reactSyntaxConfigFor(layout, { enabled: true });

    expect(fallback.rules['nitpicker/react-single-styling-approach']).toEqual([
      'error',
      { approach: 'class-names' },
    ]);
    expect(explicit.rules['nitpicker/react-single-styling-approach']).toEqual([
      'error',
      { approach: 'class-names' },
    ]);
    expect(configured.rules['nitpicker/react-single-styling-approach']).toEqual([
      'error',
      { approach: 'inline-style' },
    ]);
  });

  it('allows an error boundary, which React supports only as a class, and flags other classes', async () => {
    const config = [
      { languageOptions: { parser: tseslint.parser } },
      ...(await reactSyntaxConfigFor(layout)),
    ];
    const rulesFlaggedIn = (body) =>
      lintFixture({
        config,
        filename: 'src/main/ui/boundary.tsx',
        code: `import { Component } from 'react'; export class Boundary extends Component { ${body} render() { return <div />; } }`,
      }).map(({ ruleId }) => ruleId);

    expect(
      rulesFlaggedIn('static getDerivedStateFromError() { return { failed: true }; }'),
    ).toEqual([]);
    expect(rulesFlaggedIn('componentDidCatch() {}')).toEqual([]);
    expect(rulesFlaggedIn('')).toEqual(['react-x/no-class-component']);
  });

  it('keeps the accessibility rule options of the plugin', async () => {
    const [entry] = await reactSyntaxConfigFor(layout);

    expect(entry.rules['jsx-a11y/alt-text']).toEqual(['error']);
    expect(entry.rules['jsx-a11y/no-noninteractive-tabindex']).toEqual([
      'error',
      { tags: [], roles: ['tabpanel'], allowExpressionValues: true },
    ]);
  });

  it('applies to production source only, not to tests', async () => {
    const entries = await reactScopeConfigFor(layout);

    for (const file of ['src/ui/panel.tsx', 'src/hooks/use-panel.ts']) {
      const config = await calculatedConfig(entries, file);
      expect(config.rules['react-hooks/rules-of-hooks'], file).toBeDefined();
    }
    for (const file of [
      'src/ui/panel.test.tsx',
      'test/panel.tsx',
      '__tests__/panel.tsx',
      'e2e/panel.tsx',
      'src/ui/__tests__/panel.tsx',
    ]) {
      const config = await calculatedConfig(entries, file);
      expect(config?.rules?.['react-hooks/rules-of-hooks'], file).toBeUndefined();
    }
  });

  it('applies the test rules to test files only, not to production source', async () => {
    const entries = await reactScopeConfigFor(layout);

    for (const file of [
      'src/ui/panel.test.tsx',
      'src/ui/panel.spec.jsx',
      'test/panel.tsx',
      'tests/ui/panel.tsx',
      '__tests__/ui/panel.tsx',
      'e2e/ui/panel.tsx',
      'src/ui/__tests__/panel.tsx',
    ]) {
      const config = await calculatedConfig(entries, file);
      expect(config?.rules?.['testing-library/no-test-id-queries'], file).toBeDefined();
      expect(config.rules['nitpicker/react-test-no-implementation-details'], file).toBeDefined();
    }
    for (const file of ['src/ui/panel.tsx', 'src/hooks/use-panel.ts']) {
      const config = await calculatedConfig(entries, file);
      expect(config.rules['testing-library/no-test-id-queries'], file).toBeUndefined();
      expect(config.rules['nitpicker/react-test-no-implementation-details'], file).toBeUndefined();
    }
  });

  it.each([
    [
      'a Playwright test',
      "import { test } from '@playwright/test'; test('a', async ({ page }) => { await page.getByTestId('save').click(); });",
    ],
    [
      'a store test',
      'useStore.setState({ count: 0 }); expect(machine.state()).toBe(1); Registry.getInstance();',
    ],
    [
      'an unrelated helper',
      "import { helper } from './helpers'; fireEvent.click(helper()); screen.getByTestId('a');",
    ],
  ])('reports nothing in %s that imports no React test module', async (_name, code) => {
    const config = [
      { languageOptions: { parser: tseslint.parser } },
      ...(await reactSyntaxConfigFor(layout)),
    ];

    expect(lintFixture({ config, filename: 'test/ui/a.test.ts', code })).toEqual([]);
  });

  it.each([
    ['@testing-library/react', "import { render } from '@testing-library/react';"],
    ['react', "import { act } from 'react';"],
    ['react-dom', "import { flushSync } from 'react-dom';"],
    ['enzyme', "import { mount } from 'enzyme';"],
    ['react-test-renderer', "import renderer from 'react-test-renderer';"],
  ])('reports in a test that imports %s', async (_name, importLine) => {
    const config = [
      { languageOptions: { parser: tseslint.parser } },
      ...(await reactSyntaxConfigFor(layout)),
    ];

    const rules = lintFixture({
      config,
      filename: 'test/ui/a.test.ts',
      code: `${importLine} wrapper.state();`,
    }).map(({ ruleId }) => ruleId);

    expect(rules).toEqual(['nitpicker/react-test-no-implementation-details']);
  });

  it.each([
    ['a destructured query', "const { getByRole } = render(<A />); getByRole('button');", 1],
    ['a query on the render result', "render(<A />).getByRole('button');", 1],
    [
      'a query through a project test-utils wrapper',
      "import { renderWithProviders } from '../utils/test-utils'; const { getByRole } = renderWithProviders(<A />); getByRole('button');",
      1,
    ],
    ['a screen query', "render(<A />); screen.getByRole('button');", 0],
    ['a within query', "render(<A />); within(screen.getByRole('list')).getByRole('listitem');", 0],
    ['an unrelated render result use', 'const { rerender } = render(<A />); rerender(<A />);', 0],
  ])('prefers screen queries: %s', async (_name, code, count) => {
    const config = [
      { languageOptions: { parser: tseslint.parser } },
      ...(await reactSyntaxConfigFor(layout)),
    ];

    const rules = lintFixture({
      config,
      filename: 'test/ui/a.test.tsx',
      code: `import { render, screen, within } from '@testing-library/react'; ${code}`,
    }).filter(({ ruleId }) => ruleId === 'testing-library/prefer-screen-queries');

    expect(rules).toHaveLength(count);
  });

  it.each([
    [
      'toMatchSnapshot on a query',
      "render(<A />); expect(screen.getByRole('list')).toMatchSnapshot();",
    ],
    [
      'toMatchInlineSnapshot on a query',
      "render(<A />); expect(screen.getByRole('list')).toMatchInlineSnapshot();",
    ],
    [
      'toMatchSnapshot on asFragment',
      'const { asFragment } = render(<A />); expect(asFragment()).toMatchSnapshot();',
    ],
  ])('allows a snapshot-only test: %s', async (_name, body) => {
    const config = [
      { languageOptions: { parser: tseslint.parser } },
      ...(await reactSyntaxConfigFor(layout)),
    ];

    expect(
      lintFixture({
        config,
        filename: 'test/ui/a.test.tsx',
        code: `import { render, screen } from '@testing-library/react'; it('renders', () => { ${body} });`,
      }),
    ).toEqual([]);
  });

  it('reaches container queries made through a project test-utils wrapper', async () => {
    const config = [
      { languageOptions: { parser: tseslint.parser } },
      ...(await reactSyntaxConfigFor(layout)),
    ];

    const rules = lintFixture({
      config,
      filename: 'test/ui/a.test.tsx',
      code: "import { renderWithProviders } from '../utils/test-utils'; const { container } = renderWithProviders(<A />); container.querySelector('a');",
    }).map(({ ruleId }) => ruleId);

    expect(rules).toEqual(['testing-library/no-node-access']);
  });

  it('keeps the test-id rule for web projects and switches it off for React Native', async () => {
    const web = projectWith(manifestWith({ dependencies: { react: '19.0.0' } }));
    const native = projectWith(
      manifestWith({
        dependencies: { react: '19.0.0' },
        devDependencies: { '@testing-library/react-native': '13.0.0' },
      }),
    );
    const testRules = async (projectRoot) =>
      (await reactScopeConfigFor(layout, {}, projectRoot))[1].rules;

    expect((await testRules(web))['testing-library/no-test-id-queries']).toBe('error');
    expect((await testRules(native))['testing-library/no-test-id-queries']).toBe('off');
    expect((await testRules(native))['testing-library/no-node-access']).toBe('error');
  });

  it('never runs an upstream fixer, which would mutate the AST before other rules read it', async () => {
    const root = projectWith(undefined);
    const eslint = new ESLint({
      cwd: root,
      overrideConfigFile: true,
      overrideConfig: [
        {
          files: ['**/*.tsx'],
          languageOptions: {
            parser: tseslint.parser,
            parserOptions: {
              projectService: { allowDefaultProject: ['test/*.tsx'] },
              tsconfigRootDir: root,
            },
          },
          plugins: { '@typescript-eslint': tseslint.plugin },
          rules: { '@typescript-eslint/require-await': 'error' },
        },
        ...(await reactSyntaxConfigFor(layout)),
      ],
    });
    const code = [
      "import userEvent from '@testing-library/user-event';",
      "import { screen, waitFor } from '@testing-library/react';",
      "it('sync call', () => { userEvent.click(screen.getByRole('button')); });",
      "it('sync setup', () => { const user = userEvent.setup(); user.click(screen.getByRole('button')); });",
      "it('in waitFor', async () => { await waitFor(() => { userEvent.click(screen.getByRole('button')); }); });",
    ].join('\n');

    const [result] = await eslint.lintText(code, { filePath: path.join(root, 'test/a.test.tsx') });

    expect(result.messages.map(({ ruleId }) => ruleId)).toEqual([
      'testing-library/prefer-user-event-setup',
      'testing-library/await-async-events',
      'testing-library/await-async-events',
      'testing-library/prefer-user-event-setup',
      'testing-library/await-async-events',
    ]);
    expect(result.messages.every(({ fix, suggestions }) => !fix && !suggestions)).toBe(true);
  });

  it('follows a custom layout', async () => {
    const entries = await reactScopeConfigFor(resolveLayout({ sourceRoots: ['lib'] }));

    expect((await calculatedConfig(entries, 'lib/panel.tsx')).rules).toHaveProperty(
      'react-hooks/rules-of-hooks',
    );
    expect((await calculatedConfig(entries, 'src/panel.tsx'))?.rules ?? {}).not.toHaveProperty(
      'react-hooks/rules-of-hooks',
    );
  });

  it('follows a custom test root', async () => {
    const entries = await reactScopeConfigFor(resolveLayout({ testRoots: ['spec'] }));

    expect((await calculatedConfig(entries, 'spec/panel.tsx')).rules).toHaveProperty(
      'testing-library/no-test-id-queries',
    );
    expect((await calculatedConfig(entries, 'test/panel.tsx'))?.rules ?? {}).not.toHaveProperty(
      'testing-library/no-test-id-queries',
    );
  });
});
