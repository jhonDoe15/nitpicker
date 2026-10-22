import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PACKAGE_ROOT } from '../../../../../core/tooling/tool-resolution.mjs';
import {
  resolveHeadPolicy,
  withHeadCheckoutFacts,
  withHeadPolicyFile,
} from '../../../preset/head-policy.mjs';
import { runDeadCode } from '../runners/repository.mjs';

const roots = [];
afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const MANIFEST = { name: 'app', private: true, type: 'module' };
const SOURCES = {
  'src/main.ts': "import { used } from './used';\nconsole.log(used);\n",
  'src/used.ts': 'export const used = 1;\nexport const extra = 2;\n',
  'src/unused.ts': 'export const unused = 3;\n',
  'src/plugin.ts': 'export default 4;\n',
  'src/legacy/old.ts': 'export const old = 5;\n',
  'src/generated/gen.ts': 'export const gen = 6;\n',
  'lib/stray.ts': 'export const stray = 7;\n',
};
const PROJECT_KNIP = {
  entry: ['src/plugin.ts', '!src/main.ts'],
  project: ['lib/**/*.ts', '!src/generated/**'],
  ignore: ['src/legacy/**'],
  rules: { exports: 'off' },
  treatConfigHintsAsErrors: true,
};

function createProject(files, manifest = MANIFEST) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-knip-precedence-'));
  roots.push(root);
  symlinkSync(path.join(PACKAGE_ROOT, 'node_modules'), path.join(root, 'node_modules'));
  for (const [name, text] of Object.entries({ 'package.json': manifest, ...files })) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), typeof text === 'string' ? text : JSON.stringify(text));
  }
  return root;
}

function deadCode(root, policy) {
  return withHeadPolicyFile(policy, (policyFile) => {
    vi.stubEnv('NITPICKER_POLICY', policyFile);
    return runDeadCode({
      projectRoot: root,
      policyRoot: PACKAGE_ROOT,
      liveProjectRoot: PACKAGE_ROOT,
      analyzerName: 'dead-code',
      kind: 'dead-code',
    });
  });
}

function reported(findings) {
  return findings
    .filter(({ rule }) => ['files', 'exports', 'unused-dependency'].includes(rule))
    .map(({ rule, path: file, symbol }) => (rule === 'files' ? file : `${rule} ${symbol}`))
    .toSorted();
}

function knipConfig(precedence, preset) {
  return { ...(preset === undefined ? {} : { preset }), tools: { knip: { precedence } } };
}

const NITPICKER_ONLY = [
  'exports extra',
  'src/generated/gen.ts',
  'src/legacy/old.ts',
  'src/plugin.ts',
  'src/unused.ts',
];

describe('knip project config precedence', () => {
  it.each([
    [['nitpicker'], NITPICKER_ONLY],
    [['project'], ['src/unused.ts']],
    [['project', 'nitpicker'], ['src/unused.ts']],
    [
      ['nitpicker', 'project'],
      ['exports extra', 'src/unused.ts'],
    ],
  ])('runs the pinned knip with %j', (precedence, expected) => {
    const root = createProject({ ...SOURCES, 'knip.json': JSON.stringify(PROJECT_KNIP) });
    const policy = resolveHeadPolicy(knipConfig(precedence), root);
    expect(reported(deadCode(root, policy))).toEqual(expected);
  });

  it('lays the project config over the JavaScript preset', () => {
    const sources = Object.fromEntries(
      Object.entries(SOURCES).map(([name, text]) => [name.replace(/\.ts$/u, '.js'), text]),
    );
    const config = { ...PROJECT_KNIP, entry: ['src/plugin.js'], project: ['!src/generated/**'] };
    const root = createProject({ ...sources, 'knip.json': JSON.stringify(config) });
    const javascript = (precedence) =>
      reported(deadCode(root, resolveHeadPolicy(knipConfig(precedence, 'javascript'), root)));
    expect(javascript(['nitpicker'])).toEqual(
      NITPICKER_ONLY.map((file) => file.replace(/\.ts$/u, '.js')),
    );
    expect(javascript(['project', 'nitpicker'])).toEqual(['src/unused.js']);
  });

  it('never applies the knip key in package.json without the opt-in', () => {
    const manifest = { ...MANIFEST, knip: { rules: { files: 'off', exports: 'off' } } };
    const root = createProject(SOURCES, manifest);
    expect(reported(deadCode(root, resolveHeadPolicy({}, root)))).toEqual([...NITPICKER_ONLY]);
    const optedIn = resolveHeadPolicy(knipConfig(['project', 'nitpicker']), root);
    expect(optedIn.tools.knip.projectConfigFile).toBe('the "knip" key in package.json');
    expect(reported(deadCode(root, optedIn))).toEqual([]);
  });

  it('loads a TypeScript config with regular expressions from the head checkout', () => {
    const manifest = { ...MANIFEST, dependencies: { 'left-pad': '1.3.0' } };
    const config = [
      "import type { KnipConfig } from 'knip';",
      "const config: KnipConfig = { ignoreDependencies: [/^left-/u], entry: ['src/plugin.ts'] };",
      'export default async () => config;',
      '',
    ].join('\n');
    const root = createProject({ ...SOURCES, 'knip.ts': config }, manifest);
    const policy = resolveHeadPolicy(knipConfig(['nitpicker', 'project']), root);
    expect(policy.tools.knip.projectConfig.ignoreDependencies).toEqual([
      { $nitpickerRegExp: ['^left-', 'u'] },
    ]);
    expect(reported(deadCode(root, policy))).not.toContain('unused-dependency left-pad');
    expect(reported(deadCode(root, resolveHeadPolicy({}, root)))).toContain(
      'unused-dependency left-pad',
    );
  });

  it('carries the per-workspace configs and keeps nitpicker on the root workspace', () => {
    const manifest = { ...MANIFEST, workspaces: ['packages/*'] };
    const workspaceKnip = {
      workspaces: {
        '.': { ignore: ['src/legacy/**'] },
        'packages/lib': { entry: ['src/index.ts', 'src/tool.ts'] },
      },
    };
    const root = createProject(
      {
        ...SOURCES,
        'packages/lib/package.json': JSON.stringify({ name: 'lib', main: 'src/index.ts' }),
        'packages/lib/src/index.ts': 'export const lib = 1;\n',
        'packages/lib/src/tool.ts': 'export const tool = 2;\n',
        'knip.json': JSON.stringify(workspaceKnip),
      },
      manifest,
    );
    const files = (precedence) =>
      reported(deadCode(root, resolveHeadPolicy(knipConfig(precedence), root))).filter(
        (entry) => !entry.startsWith('exports '),
      );
    expect(files(['nitpicker'])).toEqual([
      'packages/lib/src/tool.ts',
      'src/generated/gen.ts',
      'src/legacy/old.ts',
      'src/plugin.ts',
      'src/unused.ts',
    ]);
    expect(files(['project', 'nitpicker'])).toEqual([
      'src/generated/gen.ts',
      'src/plugin.ts',
      'src/unused.ts',
    ]);
  });

  it('applies the head config to the base snapshot', () => {
    const head = createProject({ ...SOURCES, 'knip.json': JSON.stringify(PROJECT_KNIP) });
    const base = createProject({ ...SOURCES, 'knip.json': '{}' });
    const headPolicy = resolveHeadPolicy(knipConfig(['project', 'nitpicker']), head);
    const basePolicy = withHeadCheckoutFacts(resolveHeadPolicy({}), headPolicy);
    expect(basePolicy.tools.knip).toEqual(headPolicy.tools.knip);
    expect(reported(deadCode(base, basePolicy))).toEqual(['src/unused.ts']);
  });

  it('fails the dead-code check when the opted-in config is missing or malformed', () => {
    const root = createProject(SOURCES);
    expect(() => deadCode(root, resolveHeadPolicy(knipConfig(['project']), root))).toThrow(
      '"tools.knip.precedence" lists "project" but a knip config (knip.json',
    );
    writeFileSync(path.join(root, 'knip.json'), '{ "entry": [');
    expect(() => deadCode(root, resolveHeadPolicy(knipConfig(['project']), root))).toThrow(
      "Could not read the project's knip config (knip.json)",
    );
  });
});
