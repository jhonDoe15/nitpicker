import { rmSync } from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createProject } from '../test-support/oxlint-project.mjs';
import { baseUrlFreeOptions } from './oxlint-paths.mjs';

const roots = [];

function optionsFor(files, config) {
  const root = createProject('nitpicker-oxlint-paths-test-', files);
  roots.push(root);
  return {
    root,
    options: baseUrlFreeOptions(config, path.join(root, 'tsconfig.nitpicker.json')),
  };
}

afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

describe('baseUrlFreeOptions', () => {
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
});
