import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { PACKAGE_ROOT } from '../../../../../core/tooling/tool-resolution.mjs';
import {
  loadTypeScript,
  preEmitDiagnostics,
} from '../../../adapters/typecheck/typescript-program.mts';
import { layoutTransformFor, resolveHeadPolicy, resolveLayoutFor } from './policy-views.mts';

export function json(value: unknown): string {
  return JSON.stringify(value);
}

export const COMMON = {
  target: 'ES2022',
  module: 'ESNext',
  moduleResolution: 'Bundler',
  lib: ['ES2022'],
};

export const SOLUTION = json({
  files: [],
  references: [{ path: './tsconfig.build.json' }, { path: './tsconfig.spec.json' }],
});

export const BUILD = json({
  compilerOptions: { ...COMMON, types: ['node'] },
  include: ['src/**/*.ts'],
  exclude: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
});

export const SPEC = json({
  compilerOptions: {
    ...COMMON,
    types: ['vitest/globals'],
    jsx: 'react-jsx',
    jsxImportSource: 'hono/jsx',
  },
  include: ['src'],
});

export const STUBS = {
  'node_modules/@types/node/index.d.ts':
    'declare var process: { env: Record<string, string | undefined> };\n',
  'node_modules/vitest/globals.d.ts': [
    'declare function describe(name: string, run: () => void): void;',
    'declare function it(name: string, run: () => void): void;',
    'declare function expect(value: unknown): { toBe(expected: unknown): void };',
    '',
  ].join('\n'),
  'node_modules/hono/jsx/jsx-runtime.d.ts': [
    'export function jsx(type: unknown, props: unknown): unknown;',
    'export function jsxs(type: unknown, props: unknown): unknown;',
    'export namespace JSX {',
    '  interface IntrinsicElements { [name: string]: unknown }',
    '}',
    '',
  ].join('\n'),
};

export const SOURCES = {
  'src/value.ts': 'export const value = 1;\n',
  'src/value.test.ts':
    "import { value } from './value';\ndescribe('value', () => {\n  it('is one', () => {\n    expect(value).toBe(1);\n  });\n});\n",
  'src/view.test.tsx':
    "describe('view', () => {\n  it('renders', () => {\n    expect(<p>hi</p>).toBe(1);\n  });\n});\n",
};

export const PRODUCTION_WITH_NODE = {
  'src/env.ts': "export const mode = process.env['MODE'];\n",
};

function stagedConfig(root: string, config: Record<string, unknown>) {
  const policy = resolveHeadPolicy(
    { ...config, tools: { typescript: { precedence: ['project'] } } },
    root,
  );
  const name = 'tsconfig.quality.json';
  const text = readFileSync(
    path.join(PACKAGE_ROOT, 'languages/typescript/preset/defaults', name),
    'utf8',
  );
  const target = path.join(root, `.nitpicker-${name}`);
  writeFileSync(target, layoutTransformFor(name, resolveLayoutFor(policy))(text, target));
  return target;
}

export async function diagnostics(
  root: string,
  config: Record<string, unknown> = {},
): Promise<{ code: number; file: string }[]> {
  const found = await preEmitDiagnostics({
    ts: loadTypeScript(PACKAGE_ROOT),
    engine: 'project',
    configPath: stagedConfig(root, config),
    configName: undefined,
    projectRoot: root,
    projectNative: undefined,
  });
  return found.map(({ code, file }) => ({
    code,
    file: file === undefined ? '' : path.relative(root, file.fileName),
  }));
}
