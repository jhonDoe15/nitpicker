import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { existsSync, symlinkSync } from 'node:fs';
import { dependencyPreparationMode } from '../../../../../languages/typescript/adapters/static-checks/dependencies.mjs';
import { parseArguments } from '../../../../../languages/typescript/adapters/static-checks/arguments.mjs';
import { runTypecheck } from '../../../../../languages/typescript/adapters/static-checks/typescript.mjs';
import {
  toolRoot,
  registerStaticRepositoryLifecycle,
  temporaryDirectory,
  generatedSnapshot,
  writeFiles,
} from './static-check-fixtures.mjs';

registerStaticRepositoryLifecycle();

describe('static differential adapters: dependencies', () => {
  it('installs merge-base dependencies when dependency manifests differ', () => {
    const projectRoot = temporaryDirectory('base-dependencies-');
    const policyRoot = temporaryDirectory('head-dependencies-');
    writeFiles(projectRoot, {
      'package.json': '{"name":"fixture"}\n',
      'package-lock.json': '{"lockfileVersion":3}\n',
    });
    writeFiles(policyRoot, {
      'package.json': '{"name":"fixture"}\n',
      'package-lock.json': '{"lockfileVersion":3}\n',
    });

    expect(dependencyPreparationMode({ projectRoot, liveProjectRoot: policyRoot })).toBe('link');

    writeFiles(policyRoot, {
      'package-lock.json': '{"lockfileVersion":3,"packages":{"node_modules/example":{}}}\n',
    });

    expect(dependencyPreparationMode({ projectRoot, liveProjectRoot: policyRoot })).toBe('install');
    expect(
      dependencyPreparationMode({
        projectRoot: toolRoot,
        liveProjectRoot: toolRoot,
      }),
    ).toBe('existing');
  });
  it('typechecks the merge base with its own dependency tree', async () => {
    const projectRoot = generatedSnapshot();
    const policyRoot = generatedSnapshot();
    const packageJson = {
      name: 'base-dependency-fixture',
      version: '1.0.0',
      private: true,
      dependencies: {
        'fixture-types': 'file:vendor/fixture-types',
      },
    };
    const typeScriptConfig = JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'Bundler',
        lib: ['ES2022'],
        types: [],
        strict: true,
        skipLibCheck: true,
      },
      include: ['src/**/*.ts'],
    });
    writeFiles(projectRoot, {
      'package.json': `${JSON.stringify(packageJson)}\n`,
      'vendor/fixture-types/package.json':
        '{"name":"fixture-types","version":"1.0.0","types":"index.d.ts"}\n',
      'vendor/fixture-types/index.d.ts':
        'export interface FixtureValue { readonly value: string }\n',
      'src/fixture.ts': [
        "import type { FixtureValue } from 'fixture-types';",
        "export const fixture: FixtureValue = { value: 'base' };",
        '',
      ].join('\n'),
      'tsconfig.quality.json': `${typeScriptConfig}\n`,
    });
    const packageLock = `${JSON.stringify({
      name: packageJson.name,
      version: packageJson.version,
      lockfileVersion: 3,
      requires: true,
      packages: {
        '': {
          name: packageJson.name,
          version: packageJson.version,
          dependencies: packageJson.dependencies,
        },
        'node_modules/fixture-types': { resolved: 'vendor/fixture-types', link: true },
        'vendor/fixture-types': { version: '1.0.0' },
      },
    })}\n`;
    writeFiles(projectRoot, { 'package-lock.json': packageLock });
    const liveProjectRoot = temporaryDirectory('live-project-dependencies-');
    const livePackageJson = { ...packageJson, version: '2.0.0' };
    writeFiles(policyRoot, {
      'package.json': `${JSON.stringify(livePackageJson)}\n`,
      'package-lock.json': packageLock,
      'tsconfig.quality.json': `${typeScriptConfig}\n`,
    });
    writeFiles(liveProjectRoot, {
      'package.json': `${JSON.stringify(livePackageJson)}\n`,
      'package-lock.json': packageLock,
    });
    symlinkSync(
      path.join(toolRoot, 'node_modules'),
      path.join(liveProjectRoot, 'node_modules'),
      'dir',
    );
    expect(dependencyPreparationMode({ projectRoot, liveProjectRoot })).toBe('install');

    const findings = await runTypecheck(
      parseArguments([
        '--analyzer-name',
        'typescript-typecheck',
        '--kind',
        'typecheck',
        '--project-root',
        projectRoot,
        '--live-project-root',
        liveProjectRoot,
        '--policy-root',
        policyRoot,
        '--config',
        'tsconfig.quality.json',
        '--tool-root',
        toolRoot,
      ]),
    );

    expect(findings).toEqual([]);
    expect(existsSync(path.join(projectRoot, 'node_modules'))).toBe(false);
  });
  it('rejects filesystem roots outside trusted or generated worktrees', () => {
    const untrustedRoot = temporaryDirectory('untrusted-static-root-');

    expect(() =>
      parseArguments([
        '--analyzer-name',
        'prettier-format',
        '--kind',
        'prettier',
        '--project-root',
        untrustedRoot,
        '--policy-root',
        untrustedRoot,
        '--config',
        '.prettierrc.json',
        '--ignore-path',
        '.prettierignore',
        '--pattern',
        'src/main/**/*.ts',
        '--tool-root',
        toolRoot,
      ]),
    ).toThrow(new Error('--project-root must be inside a generated quality-diff worktree'));
  });
});
