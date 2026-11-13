import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { PACKAGE_ROOT } from '../../../../../core/tooling/tool-resolution.mjs';
import { runTypecheck } from '../../static-checks/typescript.mts';
import { resolveTool } from '../../typed/tooling.mts';

const roots: string[] = [];
const source =
  "export const mode = process.env['NODE_ENV'];\n" +
  'export function identity(value) { return value; }\n';
const configOptions = {
  target: 'ES2022',
  module: 'ESNext',
  moduleResolution: 'Bundler',
  lib: ['ES2022'],
  types: [],
  noEmit: true,
  strict: false,
  skipLibCheck: true,
};

afterEach(() => {
  vi.unstubAllEnvs();
});

afterAll(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function project(configFiles: Readonly<Record<string, string>>): string {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-project-roots-')));
  roots.push(root);
  const files = {
    ...configFiles,
    'src/main.ts': source,
    'benchmarks/setup.ts': "import '../support/context.js';\n",
    'support/context.d.ts': '/// <reference types="node" />\nexport {};\n',
  };
  for (const [name, text] of Object.entries(files)) {
    const file = path.join(root, name);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
  symlinkSync(path.join(PACKAGE_ROOT, 'node_modules'), path.join(root, 'node_modules'), 'dir');
  return root;
}

async function findings(root: string, engine: string, exclude: readonly string[] = []) {
  const policy = path.join(root, 'policy.json');
  writeFileSync(policy, JSON.stringify({ exclude, tools: { typescript: { engine } } }));
  vi.stubEnv('NITPICKER_POLICY', policy);
  return runTypecheck({
    analyzerName: 'typescript-typecheck',
    kind: 'typecheck',
    projectRoot: root,
    policyRoot: PACKAGE_ROOT,
    toolRoot: PACKAGE_ROOT,
    liveProjectRoot: PACKAGE_ROOT,
    configRelativePath: 'languages/typescript/preset/defaults/tsconfig.quality.json',
    ignoreRelativePath: undefined,
    includeOnly: undefined,
    exclude: undefined,
    patterns: [],
  });
}

const projectConfigs = [
  [
    'include roots',
    {
      'tsconfig.json': JSON.stringify({
        compilerOptions: configOptions,
        include: ['src', 'benchmarks'],
      }),
    },
  ],
  [
    'explicit files',
    {
      'tsconfig.json': JSON.stringify({
        compilerOptions: configOptions,
        files: ['src/main.ts', 'benchmarks/setup.ts'],
      }),
    },
  ],
  [
    'inherited include roots relative to the base config',
    {
      'tsconfig.json': JSON.stringify({ extends: './config/base.json' }),
      'config/base.json': JSON.stringify({
        compilerOptions: configOptions,
        include: ['../src', '../benchmarks'],
      }),
    },
  ],
] satisfies readonly (readonly [string, Readonly<Record<string, string>>])[];

const cases = projectConfigs.flatMap(([name, configs]) =>
  ['native', 'project'].map((engine) => ({ name, configs, engine })),
);

const prepared = new Map<
  string,
  {
    readonly root: string;
    readonly baseline: {
      readonly status: number | null;
      readonly stdout: string;
      readonly stderr: string;
    };
  }
>();

beforeAll(() => {
  const compiler = path.join(
    resolveTool('typescript', { projectRoot: PACKAGE_ROOT }).root,
    'lib/tsc.js',
  );
  cases.forEach(({ name, configs, engine }) => {
    const root = project(configs);
    const { status, stdout, stderr } = spawnSync(
      process.execPath,
      [compiler, '--noEmit', '-p', root],
      {
        encoding: 'utf8',
        timeout: 20_000,
      },
    );
    prepared.set(`${name}/${engine}`, { root, baseline: { status, stdout, stderr } });
  });
});

describe('the type check preserves the project global type context', () => {
  it.each(cases)(
    'loads transitive Node globals from $name with $engine',
    async ({ name, engine }) => {
      const fixture = prepared.get(`${name}/${engine}`);
      if (fixture === undefined) throw new Error('Missing type-check fixture');
      const { root, baseline } = fixture;
      expect(baseline).toEqual({ status: 0, stdout: '', stderr: '' });

      const result = await findings(root, engine);
      expect(result.map(({ path: file, rule }) => ({ path: file, rule }))).toEqual([
        { path: 'src/main.ts', rule: 'TS7006' },
      ]);
    },
  );

  it.each(['native', 'project'])(
    'retains supplemental and excluded roots for globals without their diagnostics with %s',
    async (engine) => {
      const root = project({
        'tsconfig.json': JSON.stringify({
          compilerOptions: configOptions,
          include: ['src', 'benchmarks/setup.ts'],
        }),
      });
      writeFileSync(
        path.join(root, 'benchmarks/setup.ts'),
        "import '../support/context.js';\nimport './helper.js';\nexport const invalid: number = 'text';\n",
      );
      writeFileSync(
        path.join(root, 'benchmarks/helper.ts'),
        "export const invalid: number = 'text';\n",
      );
      writeFileSync(path.join(root, 'src/excluded.ts'), 'export const missing = process.pid;\n');

      const result = await findings(root, engine, ['src/excluded.ts']);
      expect(result.map(({ path: file, rule }) => ({ path: file, rule }))).toEqual([
        { path: 'src/main.ts', rule: 'TS7006' },
      ]);
    },
  );
});
