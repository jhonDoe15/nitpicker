import { ESLint } from 'eslint';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { failureMessagesFor } from '../../failure-messages/harness.mjs';
import { defaultResolvedLayout } from '../../layout.mjs';
import { reactRuleIds, reactTestRuleIds } from './react-rules.mjs';
import { restrictedSyntaxFor, strictSyntaxConfig, strictSyntaxConfigFor } from '../strict.mjs';

const presetConfigUrl = pathToFileURL(
  path.join(fileURLToPath(new URL('../', import.meta.url)), '../defaults/eslint.config.mjs'),
);
const reactConfig = strictSyntaxConfigFor(defaultResolvedLayout, { react: true });
const classBanMessage = restrictedSyntaxFor().source.find(({ selector }) =>
  selector.startsWith('ClassDeclaration'),
).message;
const temporaryRoots = [];
let importCount = 0;

afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function classMessages(config, file, superclass) {
  return failureMessagesFor({
    config,
    filename: file,
    code: `export class Panel extends ${superclass} { render() { return 1; } }`,
  });
}

describe('class components in the strict syntax rules', () => {
  it.each(['Component', 'PureComponent', 'React.Component', 'React.PureComponent'])(
    'leaves a class extending %s to the React rule in a React project',
    (superclass) => {
      for (const file of [
        'src/main/ui/panel.tsx',
        'src/main/features/x/adapters/panel.tsx',
        'src/main/features/x/domain/panel.tsx',
      ]) {
        const messages = classMessages(reactConfig, file, superclass);
        expect(
          messages.filter((message) => message === classBanMessage),
          file,
        ).toEqual([]);
      }
    },
  );

  it.each(['Component', 'PureComponent', 'React.Component', 'React.PureComponent'])(
    'still bans a class extending %s without React',
    (superclass) => {
      const messages = classMessages(strictSyntaxConfig, 'src/main/ui/panel.tsx', superclass);

      expect(messages).toEqual([classBanMessage]);
    },
  );

  it.each(['Base', 'ComponentBase', 'MyComponent', 'React.Base'])(
    'bans a class extending %s whether or not React is on',
    (superclass) => {
      for (const config of [strictSyntaxConfig, reactConfig]) {
        const messages = classMessages(config, 'src/main/ui/panel.tsx', superclass);
        expect(messages).toEqual([classBanMessage]);
      }
    },
  );

  it('keeps allowing Error subclasses', () => {
    for (const config of [strictSyntaxConfig, reactConfig]) {
      expect(classMessages(config, 'src/main/ui/panel.tsx', 'Error')).toEqual([]);
    }
  });
});

describe('null in a React project', () => {
  const nullMessage = 'Use `undefined` for an absent value';
  const nullMessages = (config, code) =>
    failureMessagesFor({ config, filename: 'src/main/ui/panel.tsx', code }).filter((message) =>
      message.includes(nullMessage),
    );

  it.each([
    'export const ref = useRef<HTMLDivElement>(null);',
    'export const ref = React.useRef(null);',
    'export const Theme = createContext<Theme | null>(null);',
    'export const Theme = React.createContext<Theme | null>(null);',
    'export const ref = useRef<number | null>(null);',
  ])('allows %s only with the React scope on', (code) => {
    expect(nullMessages(reactConfig, code)).toEqual([]);
    expect(nullMessages(strictSyntaxConfig, code).length).toBeGreaterThan(0);
  });

  it.each([
    'export const value = null;',
    'export const state = useState(null);',
    'export const state = useState<string | null>(undefined);',
    'export function read(): string | null { return undefined; }',
    'export const ref = useRef(load(null));',
    'export const ref = useRef<number>(undefined) ?? null;',
    'export const ref = notUseRef(null);',
  ])('still bans %s', (code) => {
    expect(nullMessages(reactConfig, code).length).toBeGreaterThan(0);
  });

  it('names the allowed React form in the message', () => {
    const [message] = nullMessages(reactConfig, 'export const value = null;');

    expect(message).toBe(
      'Use `undefined` for an absent value. `null` is only for strict comparison with a library value and the `JSON.stringify` replacer argument, and the `useRef` and `createContext` argument.',
    );
  });
});

async function presetConfigFor({ manifest, policy }) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-react-preset-'));
  temporaryRoots.push(root);
  writeFileSync(path.join(root, 'package.json'), JSON.stringify(manifest));
  vi.stubEnv('NITPICKER_DIFF_ESLINT_PROJECT_ROOT', root);
  if (policy !== undefined) {
    const policyFile = path.join(root, 'policy.json');
    writeFileSync(policyFile, JSON.stringify(policy));
    vi.stubEnv('NITPICKER_POLICY', policyFile);
  }
  importCount += 1;
  const module = await import(`${presetConfigUrl.href}?project=${String(importCount)}`);
  return module.default;
}

function ruleIdsOf(config) {
  return new Set(config.flatMap((entry) => Object.keys(entry.rules ?? {})));
}

function pluginNamesOf(config) {
  return new Set(config.flatMap((entry) => Object.keys(entry.plugins ?? {})));
}

function sourceRestrictedSyntax(config) {
  return config
    .filter((entry) => entry.rules?.['no-restricted-syntax'] !== undefined)
    .flatMap((entry) => entry.rules['no-restricted-syntax'].slice(1))
    .map(({ selector }) => selector)
    .filter((selector) => selector.startsWith('ClassDeclaration'));
}

const reactManifest = { dependencies: { react: '19.0.0' } };
const reactPrefixes = [
  'react-hooks/',
  'react-x/',
  'jsx-a11y/',
  'testing-library/',
  'nitpicker/react-',
];
const reactPlugins = ['react-hooks', 'react-x', 'jsx-a11y', 'testing-library'];

describe('the preset config', () => {
  it('has no React rule, plugin or class exemption in a project without react', async () => {
    const config = await presetConfigFor({ manifest: { dependencies: { preact: '10.0.0' } } });
    const reactRules = [...ruleIdsOf(config)].filter((id) =>
      reactPrefixes.some((prefix) => id.startsWith(prefix)),
    );

    expect(reactRules).toEqual([]);
    for (const name of reactPlugins) {
      expect(pluginNamesOf(config).has(name), name).toBe(false);
    }
    expect(
      sourceRestrictedSyntax(config).every((selector) => !selector.includes('Component')),
    ).toBe(true);
    expect(sourceRestrictedSyntax(config)).not.toHaveLength(0);
  });

  it('turns the React scope on when package.json lists react', async () => {
    const config = await presetConfigFor({ manifest: reactManifest });

    for (const id of [...reactRuleIds, ...reactTestRuleIds]) {
      expect(ruleIdsOf(config).has(id), id).toBe(true);
    }
    for (const name of reactPlugins) {
      expect(pluginNamesOf(config).has(name), name).toBe(true);
    }
    expect(sourceRestrictedSyntax(config).every((selector) => selector.includes('Component'))).toBe(
      true,
    );
  });

  it('follows the config override over package.json in both directions', async () => {
    const off = await presetConfigFor({
      manifest: reactManifest,
      policy: { react: { enabled: false } },
    });
    const on = await presetConfigFor({ manifest: {}, policy: { react: { enabled: true } } });

    expect(ruleIdsOf(off).has('react-hooks/rules-of-hooks')).toBe(false);
    expect(ruleIdsOf(on).has('react-hooks/rules-of-hooks')).toBe(true);
  });

  it('hands the configured styling approach to the styling rule', async () => {
    const config = await presetConfigFor({
      manifest: reactManifest,
      policy: { react: { styling: 'css-in-js' } },
    });
    const styling = config
      .map((entry) => entry.rules?.['nitpicker/react-single-styling-approach'])
      .find((setting) => setting !== undefined);

    expect(styling).toEqual(['error', { approach: 'css-in-js' }]);
  });

  it('lifts a React rule only for the configured paths', async () => {
    const config = await presetConfigFor({
      manifest: reactManifest,
      policy: {
        exceptions: [
          { rule: 'react-x/no-array-index-key', paths: ['src/legacy/**'], reason: 'Static lists' },
        ],
      },
    });
    const eslint = new ESLint({
      cwd: path.resolve(fileURLToPath(new URL('../', import.meta.url)), '../defaults'),
      overrideConfigFile: true,
      overrideConfig: config,
    });

    const legacy = await eslint.calculateConfigForFile('src/legacy/list.tsx');
    const fresh = await eslint.calculateConfigForFile('src/fresh/list.tsx');

    expect(legacy.rules['react-x/no-array-index-key'][0]).toBe(0);
    expect(fresh.rules['react-x/no-array-index-key'][0]).toBe(2);
  });

  it('skips an exception that names a React rule when the project is not a React project', async () => {
    const config = await presetConfigFor({
      manifest: {},
      policy: {
        exceptions: [
          { rule: 'react-x/no-array-index-key', paths: ['src/**'], reason: 'Static lists' },
          { rule: 'react-hooks/exhaustive-deps', paths: ['src/**'], reason: 'Legacy hooks' },
          { rule: 'jsx-a11y/alt-text', paths: ['src/**'], reason: 'Legacy markup' },
        ],
      },
    });

    expect(ruleIdsOf(config).has('react-x/no-array-index-key')).toBe(false);
  });

  it('still rejects an exception that names an unknown rule', async () => {
    for (const manifest of [{}, reactManifest]) {
      await expect(
        presetConfigFor({
          manifest,
          policy: {
            exceptions: [{ rule: 'react-hooks/exhaustive-dep', paths: ['src/**'], reason: 'Typo' }],
          },
        }),
      ).rejects.toThrow('unknown rules: react-hooks/exhaustive-dep');
    }
  });

  it('infers CSS-in-JS styling from the manifest unless the config sets it', async () => {
    const manifest = { dependencies: { react: '19.0.0', 'styled-components': '6.0.0' } };
    const stylingOf = (config) =>
      config
        .map((entry) => entry.rules?.['nitpicker/react-single-styling-approach'])
        .find((setting) => setting !== undefined);

    expect(stylingOf(await presetConfigFor({ manifest }))).toEqual([
      'error',
      { approach: 'css-in-js' },
    ]);
    expect(
      stylingOf(await presetConfigFor({ manifest, policy: { react: { styling: 'class-names' } } })),
    ).toEqual(['error', { approach: 'class-names' }]);
  });

  it('lifts a Testing Library rule only for the configured test paths', async () => {
    const config = await presetConfigFor({
      manifest: reactManifest,
      policy: {
        exceptions: [
          {
            rule: 'testing-library/no-test-id-queries',
            paths: ['test/legacy/**'],
            reason: 'Third-party widget without roles',
          },
        ],
      },
    });
    const eslint = new ESLint({
      cwd: path.resolve(fileURLToPath(new URL('../', import.meta.url)), '../defaults'),
      overrideConfigFile: true,
      overrideConfig: config,
    });

    const legacy = await eslint.calculateConfigForFile('test/legacy/widget.test.tsx');
    const fresh = await eslint.calculateConfigForFile('test/fresh/widget.test.tsx');

    expect(legacy.rules['testing-library/no-test-id-queries'][0]).toBe(0);
    expect(fresh.rules['testing-library/no-test-id-queries'][0]).toBe(2);
  });

  it('skips an exception that names a Testing Library rule when the project is not a React project', async () => {
    const config = await presetConfigFor({
      manifest: {},
      policy: {
        exceptions: [
          { rule: 'testing-library/no-node-access', paths: ['test/**'], reason: 'Widgets' },
        ],
      },
    });

    expect(ruleIdsOf(config).has('testing-library/no-node-access')).toBe(false);
  });
});
