import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import type { Layout } from '../../adapters/typed/head-policy.mts';
import { END_TO_END_ROOT, resolveLayout as untypedResolveLayout } from '../layout.mjs';
import { layoutTransformFor as untypedLayoutTransformFor } from '../tool-configs.mjs';

const resolveLayout: (
  layout?: { testRoots?: string[] },
  exclude?: string[],
  options?: { javascript?: boolean },
) => Layout = untypedResolveLayout;
const layoutTransformFor: (
  policyFileName: string,
  layout: Layout,
) => ((text: string, target: string) => string) | undefined = untypedLayoutTransformFor;

type QualityTsconfig = { readonly compilerOptions: { readonly lib?: readonly string[] } };

const parseTsconfig: (text: string) => QualityTsconfig = JSON.parse;

const shipped = readFileSync(
  path.join(import.meta.dirname, '..', 'defaults', 'tsconfig.quality.json'),
  'utf8',
);
const temporaryRoots: string[] = [];

afterAll(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function project({
  folders = [],
  files = {},
}: {
  folders?: string[];
  files?: Record<string, string>;
}): string {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-e2e-dom-'));
  temporaryRoots.push(root);
  for (const folder of folders) {
    mkdirSync(path.join(root, folder));
  }
  for (const [name, text] of Object.entries(files)) {
    writeFileSync(path.join(root, name), text);
  }
  return root;
}

function qualityTsconfig(root: string, layout = resolveLayout()): QualityTsconfig {
  const transform = layoutTransformFor('tsconfig.quality.json', layout);
  return parseTsconfig(transform?.(shipped, path.join(root, '.nitpicker-tsconfig.json')) ?? '');
}

function environmentDirective(runner: string, environment: string): string {
  return `/** @${runner}-environment ${environment} */\n`;
}

describe('the DOM lib for a root e2e folder', () => {
  it('is added to the shipped tsconfig when the project has an e2e folder', () => {
    const config = qualityTsconfig(project({ folders: [END_TO_END_ROOT] }));

    expect(config.compilerOptions.lib).toEqual(['ES2024', 'dom']);
  });

  it('is left out of the shipped tsconfig when the project has no e2e folder', () => {
    const config = qualityTsconfig(project({ folders: ['test'] }));

    expect(config.compilerOptions.lib).toEqual(['ES2024']);
  });

  it('is left out when the configured test roots do not name e2e', () => {
    const config = qualityTsconfig(
      project({ folders: [END_TO_END_ROOT] }),
      resolveLayout({ testRoots: ['test'] }),
    );

    expect(config.compilerOptions.lib).toEqual(['ES2024']);
  });

  it('is added to a project tsconfig that sets a lib without it', () => {
    const root = project({
      folders: [END_TO_END_ROOT],
      files: { 'tsconfig.json': '{ "compilerOptions": { "lib": ["ES2022"] } }' },
    });

    expect(qualityTsconfig(root).compilerOptions.lib).toEqual(['es2022', 'dom']);
  });

  it('follows a lib inherited through extends', () => {
    const root = project({
      folders: [END_TO_END_ROOT],
      files: {
        'base.json': '{ "compilerOptions": { "lib": ["ES2022", "ES2023.Array"] } }',
        'tsconfig.json': '{ "extends": "./base.json" }',
      },
    });

    expect(qualityTsconfig(root).compilerOptions.lib).toEqual(['es2022', 'es2023.array', 'dom']);
  });

  it.each([
    ['sets the DOM lib', '{ "compilerOptions": { "lib": ["ES2022", "DOM"] } }'],
    ['sets no lib, so the default libs include the DOM', '{ "compilerOptions": {} }'],
  ])('is not added to a project tsconfig that %s', (_name, tsconfig) => {
    const root = project({ folders: [END_TO_END_ROOT], files: { 'tsconfig.json': tsconfig } });

    expect(qualityTsconfig(root).compilerOptions).not.toHaveProperty('lib');
  });
});

describe.each([
  ['tsconfig.quality.json', 'TypeScript', {}],
  ['tsconfig.stryker.json', 'TypeScript', {}],
  ['tsconfig.quality.json', 'JavaScript', { javascript: true }],
  ['tsconfig.stryker.json', 'JavaScript', { javascript: true }],
])('the DOM lib in %s of the %s preset', (name: string, _preset: string, options: object) => {
  const text = readFileSync(path.join(import.meta.dirname, '..', 'defaults', name), 'utf8');
  function libOf(root: string): readonly string[] | undefined {
    const transform = layoutTransformFor(name, resolveLayout({}, [], options));
    if (transform === undefined) {
      throw new Error(`No layout transform for ${name}`);
    }
    return parseTsconfig(transform(text, path.join(root, '.nitpicker-tsconfig.json')))
      .compilerOptions.lib;
  }

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('is added when the head policy recorded a DOM test environment', () => {
    const policyRoot = project({
      files: { 'policy.json': JSON.stringify({ tools: { tests: { domEnvironment: true } } }) },
    });
    vi.stubEnv('NITPICKER_POLICY', path.join(policyRoot, 'policy.json'));

    expect(libOf(project({}))).toEqual(['ES2024', 'dom']);
  });

  it('is added when a test file asks for a DOM environment', () => {
    const root = project({
      folders: ['src'],
      files: { 'src/view.test.js': environmentDirective('jest', 'jsdom') },
    });

    expect(libOf(root)).toEqual(['ES2024', 'dom']);
  });

  it('is left out when no test runs in a DOM', () => {
    expect(libOf(project({ folders: ['src'], files: { 'src/a.test.js': '' } }))).toEqual([
      'ES2024',
    ]);
  });
});
