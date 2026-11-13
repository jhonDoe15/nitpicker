import { rmSync } from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createProject } from '../test-support/oxlint-project.mjs';
import { stageConfigOptions } from './oxlint-paths.mjs';

const roots = [];

function writtenOptions({ compilerOptions, unset }) {
  return { ...compilerOptions, ...Object.fromEntries(unset.map((option) => [option, null])) };
}

function optionsFor(files, config) {
  const root = createProject('nitpicker-oxlint-paths-test-', files);
  roots.push(root);
  return {
    root,
    options: writtenOptions(
      stageConfigOptions(config, path.join(root, 'tsconfig.nitpicker.json'), root),
    ),
  };
}

afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

describe('stageConfigOptions', () => {
  it('rewrites paths relative to a dot baseUrl and unsets baseUrl', () => {
    const { root, options } = optionsFor(
      {},
      { compilerOptions: { baseUrl: '.', paths: { '@/*': ['src/*'] } } },
    );

    expect(options).toEqual({
      baseUrl: null,
      paths: { '@/*': [`${root}/src/*`], '*': [`${root}/*`] },
    });
  });

  it('rewrites paths relative to a nested baseUrl', () => {
    const { root, options } = optionsFor(
      {},
      { compilerOptions: { baseUrl: 'src', paths: { '@lib/*': ['./lib/*', 'shared/*'] } } },
    );

    expect(options.paths).toEqual({
      '@lib/*': [`${root}/src/lib/*`, `${root}/src/shared/*`],
      '*': [`${root}/src/*`],
    });
  });

  it('maps bare imports through baseUrl when no paths are set', () => {
    const { root, options } = optionsFor({}, { compilerOptions: { baseUrl: 'src' } });

    expect(options).toEqual({ baseUrl: null, paths: { '*': [`${root}/src/*`] } });
  });

  it('follows an extends chain through another folder', () => {
    const { root, options } = optionsFor(
      {
        'tsconfig.json': JSON.stringify({ extends: './config/base.json' }),
        'config/base.json': JSON.stringify({
          compilerOptions: {
            types: [],
            lib: ['ES2022'],
            baseUrl: '../src',
            paths: { '@/*': ['*'] },
          },
        }),
      },
      { extends: './tsconfig.json', compilerOptions: { strict: true } },
    );

    expect(options).toEqual({
      baseUrl: null,
      paths: { '@/*': [`${root}/src/*`], '*': [`${root}/src/*`] },
    });
  });

  it('leaves paths without a baseUrl untouched', () => {
    const { options } = optionsFor({}, { compilerOptions: { paths: { '@/*': ['./src/*'] } } });

    expect(options).toEqual({});
  });

  it('keeps a project catch-all mapping and falls back to baseUrl after it', () => {
    const { root, options } = optionsFor(
      {},
      { compilerOptions: { baseUrl: '.', paths: { '*': ['types/*'] } } },
    );

    expect(options.paths).toEqual({ '*': [`${root}/types/*`, `${root}/*`] });
  });

  it('passes malformed path entries through for tsgolint to report', () => {
    const { root, options } = optionsFor(
      {},
      { compilerOptions: { baseUrl: '.', paths: { '@/*': 'src/*', 'ok/*': ['ok/*', 1] } } },
    );

    expect(options.paths).toEqual({
      '@/*': 'src/*',
      'ok/*': [`${root}/ok/*`, 1],
      '*': [`${root}/*`],
    });
  });

  it('leaves a malformed paths value alone', () => {
    const { options } = optionsFor({}, { compilerOptions: { baseUrl: '.', paths: ['src/*'] } });

    expect(options).toEqual({ baseUrl: null });
  });

  it('fails naming the config when TypeScript cannot read it', () => {
    expect(() => optionsFor({}, { extends: './missing.json' })).toThrow(
      /Lint TypeScript config .*tsconfig\.nitpicker\.json is invalid: .*missing\.json/u,
    );
  });

  it('unsets rootDir and moves rootDirs inside the project into the stage', () => {
    const root = createProject('nitpicker-oxlint-paths-test-', {});
    roots.push(root);
    const outside = path.join(path.dirname(root), 'shared');
    const config = { compilerOptions: { rootDir: 'src', rootDirs: ['.', 'gen', outside] } };

    expect(
      writtenOptions(
        stageConfigOptions(config, path.join(root, 'tsconfig.nitpicker.json'), '/stage'),
      ),
    ).toEqual({ rootDir: null, rootDirs: ['/stage', '/stage/gen', outside] });
  });

  it('turns off isolatedDeclarations and unsets options TypeScript 7 removed', () => {
    const { options } = optionsFor(
      {},
      {
        compilerOptions: {
          isolatedDeclarations: true,
          declaration: true,
          target: 'es5',
          module: 'umd',
          moduleResolution: 'node',
          downlevelIteration: false,
          outFile: 'out.js',
          esModuleInterop: false,
          allowSyntheticDefaultImports: false,
          alwaysStrict: false,
        },
      },
    );

    expect(options).toEqual({
      isolatedDeclarations: false,
      target: null,
      module: null,
      moduleResolution: null,
      downlevelIteration: null,
      outFile: null,
      esModuleInterop: null,
      allowSyntheticDefaultImports: null,
      alwaysStrict: null,
    });
  });

  it('keeps supported option values', () => {
    const { options } = optionsFor(
      {},
      {
        compilerOptions: {
          isolatedDeclarations: false,
          target: 'es2015',
          module: 'commonjs',
          moduleResolution: 'bundler',
          esModuleInterop: true,
          alwaysStrict: true,
        },
      },
    );

    expect(options).toEqual({});
  });

  it('leaves out type definitions that do not resolve', () => {
    const { options } = optionsFor(
      { 'node_modules/@types/present/index.d.ts': 'export {};\n' },
      { compilerOptions: { types: ['present', 'missing'] } },
    );

    expect(options).toEqual({ types: ['present'] });
  });

  it('keeps types when every entry resolves', () => {
    const { options } = optionsFor(
      { 'node_modules/@types/present/index.d.ts': 'export {};\n' },
      { compilerOptions: { types: ['present'] } },
    );

    expect(options).toEqual({});
  });
});
