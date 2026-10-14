import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { resolveLayout } from '../layout.mjs';
import { layoutTransformFor } from '../tool-configs.mjs';

const shipped = readFileSync(
  path.join(import.meta.dirname, '..', 'defaults', 'tsconfig.quality.json'),
  'utf8',
);
const temporaryRoots = [];

afterAll(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function project({ folders = [], files = {} }) {
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

function qualityTsconfig(root, layout = resolveLayout()) {
  const transform = layoutTransformFor('tsconfig.quality.json', layout);
  return JSON.parse(transform(shipped, path.join(root, '.nitpicker-tsconfig.json')));
}

describe('the DOM lib for a root e2e folder', () => {
  it('is added to the shipped tsconfig when the project has an e2e folder', () => {
    const config = qualityTsconfig(project({ folders: ['e2e'] }));

    expect(config.compilerOptions.lib).toEqual(['ES2024', 'dom']);
  });

  it('is left out of the shipped tsconfig when the project has no e2e folder', () => {
    const config = qualityTsconfig(project({ folders: ['test'] }));

    expect(config.compilerOptions.lib).toEqual(['ES2024']);
  });

  it('is left out when the configured test roots do not name e2e', () => {
    const config = qualityTsconfig(
      project({ folders: ['e2e'] }),
      resolveLayout({ testRoots: ['test'] }),
    );

    expect(config.compilerOptions.lib).toEqual(['ES2024']);
  });

  it('is added to a project tsconfig that sets a lib without it', () => {
    const root = project({
      folders: ['e2e'],
      files: { 'tsconfig.json': '{ "compilerOptions": { "lib": ["ES2022"] } }' },
    });

    expect(qualityTsconfig(root).compilerOptions.lib).toEqual(['es2022', 'dom']);
  });

  it('follows a lib inherited through extends', () => {
    const root = project({
      folders: ['e2e'],
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
    const root = project({ folders: ['e2e'], files: { 'tsconfig.json': tsconfig } });

    expect(qualityTsconfig(root).compilerOptions).not.toHaveProperty('lib');
  });
});
