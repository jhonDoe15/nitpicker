import { ESLint } from 'eslint';
import accessibility from 'eslint-plugin-jsx-a11y-x';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import tseslint from 'typescript-eslint';
import { afterEach, describe, expect, it } from 'vitest';
import { failureMessagesFor } from '../failure-messages/harness.mjs';
import { resolveLayout } from '../layout.mjs';
import { accessibilityRuleNames, reactRuleIds } from './react-rules.mjs';
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
    const [entry] = await reactSyntaxConfigFor(layout);

    expect(Object.keys(entry.rules).toSorted()).toEqual(reactRuleIds.toSorted());
  });

  it('registers an implementation for every plugin rule it configures', async () => {
    const [entry] = await reactSyntaxConfigFor(layout);

    for (const id of Object.keys(entry.rules)) {
      const [pluginName, ...rest] = id.split('/');
      expect(entry.plugins[pluginName].rules[rest.join('/')], id).toBeDefined();
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
    const lint = (body) =>
      failureMessagesFor({
        config,
        filename: 'src/main/ui/boundary.tsx',
        code: `import { Component } from 'react'; export class Boundary extends Component { ${body} render() { return <div />; } }`,
      });

    expect(lint('static getDerivedStateFromError() { return { failed: true }; }')).toEqual([]);
    expect(lint('componentDidCatch() {}')).toEqual([]);
    expect(lint('')).toEqual([expect.stringContaining('nitpicker.config.json')]);
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
    for (const file of ['src/ui/panel.test.tsx', 'test/panel.tsx', 'src/ui/__tests__/panel.tsx']) {
      const config = await calculatedConfig(entries, file);
      expect(config?.rules?.['react-hooks/rules-of-hooks'], file).toBeUndefined();
    }
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
});
