import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { fieldOf, fieldsOf } from '../../../../../shared/values/readers.mts';
import { resolveLayoutFor } from '../../layout.mts';
import { projectProgramInputs } from '../program.mts';
import type { PackagesInfo } from '../workspace/workspace-types.mts';
import { engineRegistry } from './engine-registry.mts';
import { engineProjectConfig } from './project-inputs.mts';

type ProjectFiles = Readonly<Record<string, string>>;
type CompilerOptions = Readonly<Record<string, unknown>>;

const EMPTY_PACKAGES: PackagesInfo = {
  packages: [],
  packageOf: () => undefined,
};

function withProject<T>(
  compilerOptions: CompilerOptions,
  files: ProjectFiles,
  run: (projectRoot: string, configPath: string) => T,
): T {
  const projectRoot = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-engine-inputs-')));
  try {
    const configPath = path.join(projectRoot, 'tsconfig.json');
    writeFileSync(configPath, JSON.stringify({ compilerOptions, include: ['src'] }));
    for (const [relative, content] of Object.entries(files)) {
      mkdirSync(path.dirname(path.join(projectRoot, relative)), { recursive: true });
      writeFileSync(path.join(projectRoot, relative), content);
    }
    return run(projectRoot, configPath);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
}

function generatedCompilerOptions(
  compilerOptions: CompilerOptions,
  files: ProjectFiles = { 'src/index.ts': 'export const value = 1;\n' },
): { readonly projectRoot: string; readonly options: Readonly<Record<string, unknown>> } {
  return withProject(compilerOptions, files, (projectRoot, configPath) => {
    const layout = resolveLayoutFor({ layout: {} });
    const inputs = projectProgramInputs({
      projectRoot,
      configPath,
      packagesInfo: EMPTY_PACKAGES,
      layout,
    });
    const generated = engineProjectConfig(inputs, { configPath, projectRoot });
    return { projectRoot, options: fieldsOf(fieldOf(generated, 'compilerOptions')) };
  });
}

describe('engineProjectConfig TypeScript 7 option translation', () => {
  it('translates baseUrl to absolute paths with bare lookup and unsets baseUrl', () => {
    const { projectRoot, options } = generatedCompilerOptions({
      strict: true,
      baseUrl: 'src',
      paths: { '@app/*': ['app/*'] },
    });

    expect(options['baseUrl']).toBeNull();
    expect(options['paths']).toEqual({
      '@app/*': [`${projectRoot}/src/app/*`],
      '*': [`${projectRoot}/src/*`],
    });
  });

  it('preserves existing wildcard paths when appending baseUrl bare lookup', () => {
    const { projectRoot, options } = generatedCompilerOptions({
      baseUrl: 'src',
      paths: { '*': ['types/*'] },
    });

    expect(options['baseUrl']).toBeNull();
    expect(options['paths']).toEqual({
      '*': [`${projectRoot}/src/types/*`, `${projectRoot}/src/*`],
    });
  });

  it('raises ES5 target to ES2015', () => {
    const { options } = generatedCompilerOptions({ target: 'es5' });

    expect(options['target']).toBe('ES2015');
  });

  it('unsets node10 and classic moduleResolution', () => {
    const node10 = generatedCompilerOptions({ moduleResolution: 'node10' });
    const classic = generatedCompilerOptions({ moduleResolution: 'classic' });

    expect(node10.options['moduleResolution']).toBeNull();
    expect(classic.options['moduleResolution']).toBeNull();
  });

  it('unsets other removed TypeScript 7 options', () => {
    const { options } = generatedCompilerOptions({
      module: 'amd',
      esModuleInterop: false,
      allowSyntheticDefaultImports: false,
      alwaysStrict: false,
      downlevelIteration: true,
      outFile: 'dist/out.js',
    });

    expect(options).toMatchObject({
      module: null,
      esModuleInterop: null,
      allowSyntheticDefaultImports: null,
      alwaysStrict: null,
      downlevelIteration: null,
      outFile: null,
    });
  });

  it('keeps modern configs without adding removed-option overrides', () => {
    const { projectRoot, options } = generatedCompilerOptions({
      strict: true,
      target: 'ES2022',
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
      paths: { '@app/*': ['src/app/*'] },
    });

    expect(options).not.toHaveProperty('baseUrl');
    expect(options).not.toHaveProperty('target');
    expect(options).not.toHaveProperty('module');
    expect(options).not.toHaveProperty('moduleResolution');
    expect(options['paths']).toEqual({ '@app/*': [path.join(projectRoot, 'src/app/*')] });
  });

  it('runs the typed engine on a project using baseUrl, es5 target, and node10 resolution', () => {
    const legacy = {
      strict: true,
      noEmit: true,
      skipLibCheck: true,
      types: [],
      lib: ['ES2022'],
      module: 'commonjs',
      target: 'es5',
      moduleResolution: 'node10',
      esModuleInterop: false,
      baseUrl: 'src',
      paths: { '@app/*': ['app/*'] },
    };
    const files = {
      'src/lib/helper.ts':
        'export function greet(options: { name: string; title?: string }): string { return options.name; }\n',
      'src/app/name.ts':
        'export function label(options: { text: string }): string { return options.text; }\n',
      'src/main.ts':
        "import { greet } from 'lib/helper';\nimport { label } from '@app/name';\n\n" +
        "export const message = greet({ name: label({ text: 'world' }) });\n",
    };

    const result = withProject(legacy, files, (projectRoot, configPath) =>
      engineRegistry({
        projectRoot,
        configPath,
        packagesInfo: EMPTY_PACKAGES,
        layout: resolveLayoutFor({ layout: {} }),
        react: false,
        environment: process.env,
      }),
    );

    expect(result).toBeDefined();
    const called = result?.registry.targets
      .filter(({ refs }) => refs.some(({ kind }) => kind === 'call'))
      .map(({ name }) => name)
      .sort();
    expect(called).toEqual(['greet', 'label']);
  });
});
