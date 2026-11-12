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
import { normalizeArchitectureViolations } from '../../static-checks-runner.mjs';
import { loadDependencyGraph } from '../project-dependency-graph.mjs';

const roots = [];
afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const SOURCES = {
  'package.json': JSON.stringify({ name: 'app', private: true, type: 'module' }),
  'src/main.ts': "import { a } from './a/a';\nimport { x } from './c/x';\nconsole.log(a, x);\n",
  'src/a/a.ts': "import { b } from '../b/b';\nexport const a = b;\n",
  'src/b/b.ts': 'export const b = 1;\n',
  'src/c/x.ts': "import { y } from './y';\nexport const x = (): number => y();\n",
  'src/c/y.ts': "import { x } from './x';\nexport const y = (): number => x();\n",
  'src/legacy/old.ts':
    "import { older } from './older';\nexport const old = (): number => older();\n",
  'src/legacy/older.ts':
    "import { old } from './old';\nexport const older = (): number => old();\n",
};
const PROJECT_CONFIG = [
  'module.exports = {',
  '  forbidden: [',
  "    { name: 'a-not-b', severity: 'error', from: { path: '^src/a' }, to: { path: '^src/b' } },",
  "    { name: 'no-production-cycles', severity: 'warn' },",
  '  ],',
  '  options: {',
  "    exclude: { path: '^src/legacy' },",
  "    includeOnly: '^src/b',",
  '    tsPreCompilationDeps: false,',
  "    outputType: 'dot',",
  '  },',
  '};',
  '',
].join('\n');

function createProject(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-depcruise-precedence-'));
  roots.push(root);
  symlinkSync(path.join(PACKAGE_ROOT, 'node_modules'), path.join(root, 'node_modules'));
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), text);
  }
  return root;
}

function architecture(root, policy, { reportsConfigErrors = true } = {}) {
  return withHeadPolicyFile(policy, (policyFile) => {
    vi.stubEnv('NITPICKER_POLICY', policyFile);
    const report = loadDependencyGraph({
      projectRoot: root,
      policyRoot: PACKAGE_ROOT,
      liveProjectRoot: PACKAGE_ROOT,
      patterns: ['src'],
      reportsConfigErrors,
    });
    return normalizeArchitectureViolations(report, 'dependency-architecture')
      .map(({ rule, path: file, classification }) => `${rule} ${file} ${classification}`)
      .toSorted();
  });
}

function cruiserConfig(precedence, preset) {
  return {
    ...(preset === undefined ? {} : { preset }),
    tools: { 'dependency-cruiser': { precedence } },
  };
}

const NITPICKER_ONLY = [
  'no-production-cycles src/c/x.ts enforceable',
  'no-production-cycles src/legacy/old.ts enforceable',
];
const PROJECT_FIRST = [
  'a-not-b src/a/a.ts enforceable',
  'no-production-cycles src/c/x.ts descriptive',
];

describe('dependency-cruiser project config precedence', () => {
  it.each([
    [['nitpicker'], NITPICKER_ONLY],
    [['project'], PROJECT_FIRST],
    [['project', 'nitpicker'], PROJECT_FIRST],
    [
      ['nitpicker', 'project'],
      ['a-not-b src/a/a.ts enforceable', NITPICKER_ONLY[0]],
    ],
  ])('runs the pinned dependency-cruiser with %j', (precedence, expected) => {
    const root = createProject({ ...SOURCES, '.dependency-cruiser.cjs': PROJECT_CONFIG });
    expect(architecture(root, resolveHeadPolicy(cruiserConfig(precedence), root))).toEqual(
      expected,
    );
  });

  it('lays the project config over the JavaScript preset', () => {
    const sources = Object.fromEntries(
      Object.entries(SOURCES).map(([name, text]) => [
        name.replace(/\.ts$/u, '.js'),
        text.replaceAll(': number', ''),
      ]),
    );
    const root = createProject({
      ...sources,
      '.dependency-cruiser.json': JSON.stringify({
        forbidden: [
          { name: 'a-not-b', severity: 'warn', from: { path: '^src/a' }, to: { path: '^src/b' } },
        ],
      }),
    });
    const run = (precedence) =>
      architecture(root, resolveHeadPolicy(cruiserConfig(precedence, 'javascript'), root));
    const nitpicker = [
      'no-production-cycles src/c/x.js enforceable',
      'no-production-cycles src/legacy/old.js enforceable',
    ];
    expect(run(['nitpicker'])).toEqual(nitpicker);
    expect(run(['project', 'nitpicker'])).toEqual(['a-not-b src/a/a.js descriptive', ...nitpicker]);
  });

  it('words module rules of the project and keeps their comments', () => {
    const config = {
      forbidden: [{ name: 'no-orphans', severity: 'warn', from: { orphan: true }, to: {} }],
      required: [
        {
          name: 'main-uses-z',
          comment: 'The entry must load z.',
          severity: 'error',
          module: { path: '^src/main' },
          to: { path: '^src/z' },
        },
      ],
    };
    const root = createProject({
      ...SOURCES,
      'src/orphan.ts': 'export const orphan = 1;\n',
      '.dependency-cruiser.json': JSON.stringify(config),
    });
    const policy = resolveHeadPolicy(cruiserConfig(['project', 'nitpicker']), root);
    const messages = withHeadPolicyFile(policy, (policyFile) => {
      vi.stubEnv('NITPICKER_POLICY', policyFile);
      const report = loadDependencyGraph({
        projectRoot: root,
        policyRoot: PACKAGE_ROOT,
        liveProjectRoot: PACKAGE_ROOT,
        patterns: ['src'],
      });
      return normalizeArchitectureViolations(report, 'dependency-architecture').map(
        ({ message, classification }) => `${classification}: ${message}`,
      );
    });
    expect(messages).toEqual([
      'enforceable: src/main.ts breaks the main-uses-z rule. The entry must load z.',
      'enforceable: Dependency cycle: src/c/x.ts -> src/c/y.ts -> src/c/x.ts',
      'enforceable: Dependency cycle: src/legacy/old.ts -> src/legacy/older.ts -> src/legacy/old.ts',
      'descriptive: src/orphan.ts breaks the no-orphans rule',
    ]);
  });

  it('applies the head config to the base snapshot', () => {
    const head = createProject({ ...SOURCES, '.dependency-cruiser.cjs': PROJECT_CONFIG });
    const base = createProject({ ...SOURCES, '.dependency-cruiser.json': '{}' });
    const headPolicy = resolveHeadPolicy(cruiserConfig(['project', 'nitpicker']), head);
    const basePolicy = withHeadCheckoutFacts(
      resolveHeadPolicy(cruiserConfig(['project', 'nitpicker'])),
      headPolicy,
    );
    expect(basePolicy.tools['dependency-cruiser']).toEqual(headPolicy.tools['dependency-cruiser']);
    expect(architecture(base, basePolicy)).toEqual(PROJECT_FIRST);
    const notOptedIn = withHeadCheckoutFacts(resolveHeadPolicy({}), headPolicy);
    expect(architecture(base, notOptedIn)).toEqual(NITPICKER_ONLY);
  });

  it.each([
    ['exclude: { path: /^src\\/legacy/u }', 'a RegExp exclude'],
    ['exclude: [/^src\\/legacy/u]', 'a RegExp list exclude'],
    ['doNotFollow: { path: [/^src\\/legacy/u] }', 'a RegExp doNotFollow'],
  ])('reads %s as its pattern source (%s)', (option) => {
    const config = PROJECT_CONFIG.replace("exclude: { path: '^src/legacy' },", `${option},`);
    const root = createProject({ ...SOURCES, '.dependency-cruiser.cjs': config });
    expect(
      architecture(root, resolveHeadPolicy(cruiserConfig(['nitpicker', 'project']), root)),
    ).toEqual(['a-not-b src/a/a.ts enforceable', NITPICKER_ONLY[0]]);
  });

  it('keeps type-only imports in the graph when the project config drops them', () => {
    const root = createProject({
      ...SOURCES,
      'src/a/a.ts': "import type { B } from '../b/b';\nexport const a: B = 1;\n",
      'src/b/b.ts': 'export type B = number;\n',
      '.dependency-cruiser.cjs': PROJECT_CONFIG,
    });
    expect(
      architecture(root, resolveHeadPolicy(cruiserConfig(['project', 'nitpicker']), root)),
    ).toEqual(PROJECT_FIRST);
  });

  it('fails the cruise when the opted-in config is missing or malformed', () => {
    const root = createProject(SOURCES);
    const policy = () => resolveHeadPolicy(cruiserConfig(['project']), root);
    expect(() => architecture(root, policy())).toThrow(
      '"tools.dependency-cruiser.precedence" lists "project" but a dependency-cruiser config',
    );
    writeFileSync(path.join(root, '.dependency-cruiser.js'), 'module.exports = {');
    expect(() => architecture(root, policy())).toThrow(
      "Could not read the project's dependency-cruiser config (.dependency-cruiser.js)",
    );
    expect(architecture(root, policy(), { reportsConfigErrors: false })).toEqual(NITPICKER_ONLY);
  });
});
