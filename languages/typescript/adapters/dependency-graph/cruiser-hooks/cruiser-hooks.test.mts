import { spawnSync } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PACKAGE_ROOT } from '../../../../../core/tooling/tool-resolution.mts';
import { fieldOf, listOf, textOf } from '../../../../../shared/values/readers.mts';
import { writeFileTree } from '../../test-support/file-tree.mts';
import { loadProjectModules } from '../shared-graph/project-modules.mts';
import {
  SKIPPED_FILE_MARKER,
  cruiserNodeArguments,
  reportSkippedFiles,
  skippedFiles,
} from '../shared-graph/cruiser-process.mts';
import { failureReason, isolatedExtract } from './extract-dependencies.mts';
import { normalizedManifest } from './merge-manifests.mts';
import { inputFileName, withInputFileName } from './typescript-wrap.mts';

const CRUISER = path.join(
  PACKAGE_ROOT,
  'node_modules/dependency-cruiser/bin/dependency-cruise.mjs',
);
const roots: string[] = [];
const CRUISE_TIMEOUT_MS = 60_000;
const MANIFESTS = [{}, { bundleDependencies: true }, { bundleDependencies: true, combined: true }];

type Run = ReturnType<typeof cruiseCli>;

const AFOUL = '\n  ERROR: Extracting dependencies ran afoul of...\n\n';

afterAll(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function pluginProject(manifest: Record<string, unknown>): string {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-cruiser-hooks-')));
  roots.push(root);
  writeFileTree(root, {
    'package.json': `${JSON.stringify({ name: 'plugin', dependencies: { lib: '1' }, ...manifest })}\n`,
    'tsconfig.json': '{"compilerOptions":{"module":"esnext","target":"es2022"}}\n',
    'node_modules/lib/package.json': '{"name":"lib","main":"index.js"}\n',
    'node_modules/lib/index.js': 'exports.lib = 1;\n',
    'src/index.ts':
      "export * from './actions';\nexport { pluginModule as default } from './module';\n",
    'src/module.ts': "import { lib } from 'lib';\nexport const pluginModule = lib;\n",
    'src/actions.ts': 'export const action = 1;\n',
    'cruiser.config.cjs':
      "module.exports = { options: { tsPreCompilationDeps: 'specify', combinedDependencies: " +
      `${String(manifest['combined'] === true)}, tsConfig: { fileName: 'tsconfig.json' } } };\n`,
  });
  return root;
}

function cruiseCli(root: string, nodeArguments: readonly string[], target = 'src') {
  return spawnSync(
    process.execPath,
    [...nodeArguments, CRUISER, target, '--config', 'cruiser.config.cjs', '--output-type', 'json'],
    { cwd: root, encoding: 'utf8', timeout: CRUISE_TIMEOUT_MS },
  );
}

function edges(modules: unknown): string[] {
  return listOf(modules).flatMap((module) =>
    listOf(fieldOf(module, 'dependencies')).map(
      (dependency) =>
        `${textOf(fieldOf(module, 'source'))} -> ${textOf(fieldOf(dependency, 'resolved'))}`,
    ),
  );
}

describe('dependency-cruiser hooks', () => {
  let selfImport: Run;
  let bundled: Run;
  let bundledWithHooks: Run;

  beforeAll(() => {
    selfImport = cruiseCli(pluginProject({}), []);
    bundled = cruiseCli(pluginProject({ bundleDependencies: true }), [], 'src/module.ts');
    bundledWithHooks = cruiseCli(
      pluginProject({ bundleDependencies: true }),
      cruiserNodeArguments(),
    );
  });

  it('reproduces both upstream crashes without the hooks', () => {
    expect(selfImport.status).toBe(1);
    expect(selfImport.stderr).toBe(
      `${AFOUL}  Cannot read properties of undefined (reading 'includes')\n... in src/index.ts\n\n\n`,
    );
    expect(bundled.stderr).toBe(
      `${AFOUL}  lBundledDependencies.includes is not a function\n... in src/module.ts\n\n\n`,
    );
  });

  describe.each(MANIFESTS)('with manifest %j', (manifest) => {
    let hooked: Run;

    beforeAll(() => {
      hooked = cruiseCli(pluginProject(manifest), cruiserNodeArguments());
    });

    it('cruises a file that imports ./module', () => {
      const report: unknown = JSON.parse(hooked.stdout);

      expect(hooked.stderr).toBe('');
      expect(edges(fieldOf(report, 'modules'))).toEqual([
        'src/index.ts -> src/actions.ts',
        'src/index.ts -> src/module.ts',
        'src/module.ts -> node_modules/lib/index.js',
      ]);
    });
  });

  it('marks every dependency of a package that bundles all of them', () => {
    const report: unknown = JSON.parse(bundledWithHooks.stdout);
    const lib = listOf(fieldOf(report, 'modules'))
      .flatMap((module) => listOf(fieldOf(module, 'dependencies')))
      .find((dependency) => fieldOf(dependency, 'module') === 'lib');

    expect(fieldOf(lib, 'dependencyTypes')).toEqual(['npm', 'npm-bundled', 'import']);
  });

  it('builds the shared project graph for a plugin entry that re-exports ./module', () => {
    const report = loadProjectModules({
      projectRoot: pluginProject({ bundleDependencies: true }),
      policyRoot: PACKAGE_ROOT,
      patterns: ['src'],
    });

    expect(edges(report.modules)).toEqual([
      'src/index.ts -> src/actions.ts',
      'src/index.ts -> src/module.ts',
    ]);
  });
});

describe('the transpile input name', () => {
  it('keeps the extension TypeScript would pick and avoids names the source mentions', () => {
    expect(inputFileName("import { a } from './module';", undefined, undefined)).toBe(
      'nitpicker-transpile-input.ts',
    );
    expect(inputFileName('', 'tsx', undefined)).toBe('nitpicker-transpile-input.tsx');
    expect(inputFileName('', 'tsx', { options: { jsx: 0 } })).toBe('nitpicker-transpile-input.ts');
    expect(inputFileName('', undefined, { options: { jsx: 4 } })).toBe(
      'nitpicker-transpile-input.tsx',
    );
    expect(inputFileName("import './nitpicker-transpile-input';", undefined, undefined)).toBe(
      'nitpicker-transpile-input_.ts',
    );
  });
});

describe('the transpile wrapper', () => {
  it('hands the transpiler an input name that carries the chosen extension', () => {
    const received: unknown[] = [];
    const wrapper = withInputFileName(
      {
        transpile: (source, _fileName, options) => {
          received.push(options);
          return source;
        },
      },
      'tsx',
    );

    expect(wrapper.transpile('x', 'a.tsx', { tsConfig: { options: { strict: true } } })).toBe('x');
    expect(received).toEqual([
      { tsConfig: { options: { strict: true }, fileName: 'nitpicker-transpile-input.tsx' } },
    ]);
  });
});

describe('bundled dependency lists', () => {
  it('reads true as every dependency and any other non-list as none', () => {
    const dependencies = { a: '1', b: '2' };

    expect(normalizedManifest({ dependencies, bundleDependencies: true })).toEqual({
      dependencies,
      bundleDependencies: ['a', 'b'],
    });
    expect(normalizedManifest({ dependencies, bundledDependencies: false })).toEqual({
      dependencies,
      bundledDependencies: [],
    });
    expect(normalizedManifest({ bundleDependencies: 'a' })).toEqual({ bundleDependencies: [] });
  });

  it('returns a manifest with a list or no bundle key unchanged', () => {
    const listed = { bundleDependencies: ['a'] };

    expect(normalizedManifest(listed)).toBe(listed);
    expect(normalizedManifest(null)).toBeNull();
  });
});

describe('one file dependency-cruiser cannot read', () => {
  it('costs that file its imports and is reported, not the whole cruise', () => {
    const written: string[] = [];
    const extract = isolatedExtract(
      (file) => {
        if (file === 'src/bad.ts') {
          throw new Error(
            'Extracting dependencies ran afoul of...\n\n  boom\n... in src/bad.ts\n\n',
          );
        }
        return [{ module: './good' }];
      },
      { write: (text: string) => written.push(text) },
    );

    expect(extract('src/ok.ts')).toEqual([{ module: './good' }]);
    expect(extract('src/bad.ts')).toEqual([]);
    expect(written.join('')).toMatch(new RegExp(`^${SKIPPED_FILE_MARKER}`, 'u'));
    expect(skippedFiles(`noise\n${written.join('')}`)).toEqual([
      { file: 'src/bad.ts', reason: 'boom' },
    ]);
  });

  it('turns the skipped files into warnings', () => {
    const warnings: string[] = [];
    const stderr = `${SKIPPED_FILE_MARKER}{"file":"src/a.ts","reason":"boom"}\n${SKIPPED_FILE_MARKER}{oops\n`;

    reportSkippedFiles(stderr, () => 2, { write: (text: string) => warnings.push(text) });

    expect(warnings).toEqual([
      'dependency-cruiser could not read src/a.ts, so the dependency graph leaves out its imports: boom\n',
    ]);
    expect(failureReason('plain')).toBe('plain');
  });

  it('lists the first skipped files and counts the rest', () => {
    const warnings: string[] = [];
    const stderr = Array.from(
      { length: 25 },
      (_, index) => `${SKIPPED_FILE_MARKER}{"file":"src/f${String(index)}.ts","reason":"boom"}`,
    ).join('\n');

    reportSkippedFiles(stderr, () => 100, { write: (text: string) => warnings.push(text) });

    expect(warnings).toHaveLength(21);
    expect(warnings.at(-1)).toBe('dependency-cruiser could not read 5 more files\n');
  });

  it('fails the cruise when most files could not be read, since the cause is not one file', () => {
    const stderr = `${SKIPPED_FILE_MARKER}{"file":"src/a.ts","reason":"bad config"}\n${SKIPPED_FILE_MARKER}{"file":"src/b.ts","reason":"bad config"}`;

    expect(() => {
      reportSkippedFiles(stderr, () => 3, { write: () => true });
    }).toThrow('could not read 2 of 3 files; the first, src/a.ts: bad config');
  });
});
