import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PACKAGE_ROOT } from './tooling/tool-resolution.mjs';

const enabled = process.env.NITPICKER_INSTALLED_TEST === '1';
const packageRoot = PACKAGE_ROOT;
const manifest = JSON.parse(readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
const layouts = [undefined, 'nested', 'linked'];
// npm 10.9 crashes resolving vitest's optional peers ("reading 'edgesOut'"), so
// the consumer install is pinned to a newer npm.
const installer = 'npm@11';
const cleanSource = 'export function example() {\n  return 1;\n}\n';
const violation = 'export function example(){\n  debugger;\n  return 1\n}\n';

const expectedDirtyFindings = [
  {
    tool: 'eslint-lint',
    rule: 'no-debugger',
    path: 'src/main/example.ts',
    identity: 'message:unexpected|node:LastStatement|syntax:c101e41c622a39ff619763e2|occurrence:1',
    message: "Unexpected 'debugger' statement.",
    classification: 'enforceable',
    symbol: 'example',
    location: { line: 2, column: 3 },
    ratchet: { key: 'count:unexpected', value: 1, existingCodeOnly: true },
  },
  {
    tool: 'prettier-format',
    rule: 'prettier/prettier',
    path: 'src/main/example.ts',
    identity: 'format-diff:3021261b8c9abc3d63b74d13',
    message: 'Format these lines with Prettier',
    classification: 'enforceable',
    location: { line: 1, endLine: 1 },
  },
  {
    tool: 'prettier-format',
    rule: 'prettier/prettier',
    path: 'src/main/example.ts',
    identity: 'format-diff:92772ea69de4f061a708c457',
    message: 'Format these lines with Prettier',
    classification: 'enforceable',
    location: { line: 3, endLine: 3 },
  },
];
const expectedSnapshotOutput = [
  'Nitpicker quality snapshot',
  'Status: violations',
  'Enforceable findings: 2',
  'Descriptive findings: 0',
  'Tool errors: 0',
  '',
  'Per-tool counts:',
  'prettier-format: total=2 enforceable=2 descriptive=0',
  '',
  'Enforceable findings:',
  'prettier-format/prettier/prettier src/main/example.ts:1 Format these lines with Prettier',
  'prettier-format/prettier/prettier src/main/example.ts:3 Format these lines with Prettier',
  'nitpicker: head: running 1 analyzer',
  '',
].join('\n');

function expectedDirtyOutput(root) {
  return `Base: main (argument)

Quality gate summary
✖ 3 new enforceable violations
  eslint-lint/no-debugger src/main/example.ts:2
    Unexpected 'debugger' statement.
  prettier-format/prettier/prettier src/main/example.ts (2 times, lines 1, 3)
    Format these lines with Prettier
Full diagnostics: ${root}/reports/dirty/report.txt
nitpicker: base 2 analyzers cached
nitpicker: head: running 2 analyzers
`;
}

function command(cwd, executable, args) {
  const result = spawnSync(executable, args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1' },
    timeout: 180_000,
  });
  if (result.error) throw result.error;
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

function checked(cwd, executable, args) {
  const result = command(cwd, executable, args);
  expect(result.status, `${executable} ${args.join(' ')}\n${result.output}`).toBe(0);
  return result.output.trim();
}

function write(root, relative, contents) {
  const target = path.join(root, relative);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, contents);
}

function listing(root) {
  function walk(directory, prefix = '') {
    return readdirSync(directory).flatMap((name) => {
      const relative = path.posix.join(prefix, name);
      const location = path.join(directory, name);
      if (lstatSync(location).isDirectory()) return walk(location, relative);
      return [`${relative}:${lstatSync(location).size}`];
    });
  }
  return walk(realpathSync(root)).sort();
}

function temporaryFiles(root) {
  const result = [];
  function walk(directory) {
    for (const item of readdirSync(directory, { withFileTypes: true })) {
      if (item.name === 'node_modules' || item.name === '.git') continue;
      const location = path.join(directory, item.name);
      if (/^\.(?:quality|nitpicker)-/.test(item.name)) result.push(path.relative(root, location));
      if (item.isDirectory()) walk(location);
    }
  }
  walk(root);
  return result;
}

const suite = enabled ? describe : describe.skip;
suite('packed nitpicker in a separate consumer', () => {
  let packRoot;
  let tarball;
  beforeAll(() => {
    packRoot = mkdtempSync(path.join(tmpdir(), 'nitpicker-packed-'));
    checked(packageRoot, 'npm', ['pack', '--pack-destination', packRoot]);
    const tarballs = readdirSync(packRoot).filter((file) => file.endsWith('.tgz'));
    if (tarballs.length !== 1)
      throw new Error(`Expected one packed tarball, received ${String(tarballs.length)}`);
    tarball = path.join(packRoot, tarballs[0]);
  }, 180_000);
  afterAll(() => {
    if (packRoot) rmSync(packRoot, { recursive: true, force: true });
  });

  for (const strategy of layouts) {
    describe(`dependency layout: ${strategy ?? 'hoisted'}`, () => {
      let root;
      let before;
      let clean;
      let dirty;
      let second;
      let subfolder;
      let snapshot;
      let fixed;
      let packageLocation;
      const reports = (name) => path.join(root, 'reports', name);
      const invoke = (args, cwd = root) =>
        command(cwd, 'npx', ['--no-install', 'nitpicker', ...args]);
      const summary = (name) => JSON.parse(readFileSync(path.join(reports(name), 'summary.json')));
      const findings = (name) =>
        JSON.parse(readFileSync(path.join(reports(name), 'new-findings.json')));

      beforeAll(() => {
        root = mkdtempSync(path.join(tmpdir(), `nitpicker consumer-${strategy ?? 'hoisted'}-`));
        checked(root, 'git', ['init', '-b', 'main']);
        write(root, '.gitignore', 'node_modules/\nreports/\n');
        write(
          root,
          'package.json',
          JSON.stringify(
            {
              name: 'nitpicker-installed-consumer',
              private: true,
              type: 'module',
              devDependencies: {
                nitpicker: `file:${tarball}`,
                vitest: manifest.devDependencies.vitest,
                '@vitest/coverage-v8': manifest.devDependencies['@vitest/coverage-v8'],
                typescript: manifest.devDependencies.typescript,
              },
            },
            null,
            2,
          ) + '\n',
        );
        write(root, 'src/main/example.ts', cleanSource);
        write(root, 'test/example.test.ts', 'export const placeholder = true;\n');
        // The lockfile is committed so the merge-base worktree can `npm ci`.
        checked(root, 'npx', [
          '--yes',
          installer,
          'install',
          '--no-audit',
          '--no-fund',
          '--prefer-offline',
          ...(strategy ? [`--install-strategy=${strategy}`] : []),
        ]);
        checked(root, 'git', ['add', '.']);
        checked(root, 'git', [
          '-c',
          'user.name=Installed Test',
          '-c',
          'user.email=test@example.invalid',
          'commit',
          '-m',
          'clean baseline',
        ]);
        checked(root, 'git', ['switch', '-c', 'feature']);
        packageLocation = path.join(root, 'node_modules/nitpicker');
        before = listing(packageLocation);
        clean = invoke([
          '--base',
          'main',
          '--analyzer',
          'prettier-format',
          '--analyzer',
          'eslint-lint',
          '--output',
          reports('clean'),
        ]);
        write(root, 'src/main/example.ts', violation);
        dirty = invoke([
          '--base',
          'main',
          '--analyzer',
          'prettier-format',
          '--analyzer',
          'eslint-lint',
          '--output',
          reports('dirty'),
        ]);
        second = invoke([
          '--base',
          'main',
          '--analyzer',
          'prettier-format',
          '--analyzer',
          'eslint-lint',
          '--output',
          reports('second'),
        ]);
        subfolder = invoke(
          [
            '--base',
            'main',
            '--analyzer',
            'prettier-format',
            '--analyzer',
            'eslint-lint',
            '--output',
            reports('subfolder'),
          ],
          path.join(root, 'src'),
        );
        snapshot = invoke([
          '--all',
          '--analyzer',
          'prettier-format',
          '--output',
          reports('snapshot'),
        ]);
        fixed = invoke([
          '--base',
          'main',
          '--fix',
          '--analyzer',
          'prettier-format',
          '--output',
          reports('fixed'),
        ]);
      }, 600_000);
      afterAll(() => {
        if (root) rmSync(root, { recursive: true, force: true });
      });

      it('installs a packed tarball with the requested dependency layout', () => {
        expect(realpathSync(packageLocation)).not.toBe(realpathSync(packageRoot));
        expect(existsSync(path.join(packageLocation, 'README.md'))).toBe(true);
        expect(existsSync(path.join(packageLocation, 'LICENSE'))).toBe(true);
        expect(readFileSync(path.join(packageLocation, 'LICENSE'), 'utf8')).toBe(
          readFileSync(path.join(packageRoot, 'LICENSE'), 'utf8'),
        );
        const installedManifest = JSON.parse(
          readFileSync(path.join(packageLocation, 'package.json'), 'utf8'),
        );
        expect(installedManifest.license).toBe('MIT');
        expect(installedManifest.private).toBeUndefined();
        // The Java preset's Gradle init script is resolved relative to the installed package.
        expect(
          existsSync(path.join(packageLocation, 'languages/java/gradle/nitpicker.init.gradle')),
        ).toBe(true);
      });
      it.skipIf(strategy !== undefined)(
        'resolves the hoisted ESLint installation from the consumer',
        () => {
          const eslint = realpathSync(
            createRequire(path.join(root, 'package.json')).resolve('eslint/package.json'),
          );
          expect(eslint.startsWith(realpathSync(packageLocation) + path.sep)).toBe(false);
        },
      );
      it('exits zero on clean branch and reports both new findings on dirty branch', () => {
        expect(clean.status, clean.output).toBe(0);
        expect(dirty.status, dirty.output).toBe(1);
        expect(summary('dirty').overallStatus).toBe('completed');
        expect(findings('dirty')).toEqual(expectedDirtyFindings);
        expect(dirty.output).toEqual(expectedDirtyOutput(root));
      });
      it('records pinned owned tool versions and the installed TypeScript peer', () => {
        const versions = Object.fromEntries(
          summary('dirty').tools.map(({ name, version }) => [name, version]),
        );
        expect(versions['prettier-format']).toBe(manifest.dependencies.prettier);
        const plugins = [
          '@eslint/js',
          '@vitest/eslint-plugin',
          'eslint-plugin-functional',
          'eslint-plugin-jsx-a11y-x',
          'eslint-plugin-react-hooks',
          'eslint-plugin-react-x',
          'eslint-plugin-testing-library',
          'typescript-eslint',
        ].map((name) => `${name}@${manifest.dependencies[name]}`);
        expect(versions['eslint-lint']).toBe(
          `eslint@${manifest.dependencies.eslint};typescript@${manifest.devDependencies.typescript};` +
            `plugins:${[...plugins, `nitpicker-plugin@${manifest.version}`].join(',')}`,
        );
        for (const peer of ['typescript', 'vitest', '@vitest/coverage-v8']) {
          const installed = JSON.parse(
            readFileSync(path.join(root, 'node_modules', peer, 'package.json')),
          );
          expect(installed.version).toBe(manifest.devDependencies[peer]);
        }
      });
      it('keeps the policy hash stable across two runs', () => {
        expect(second.status, second.output).toBe(1);
        expect(summary('dirty').policyHash).toBe(summary('second').policyHash);
      });
      it('does not mutate the installed package or leave consumer temporary files/worktrees', () => {
        expect(listing(packageLocation)).toEqual(before);
        expect(temporaryFiles(root)).toEqual([]);
        expect(
          checked(root, 'git', ['worktree', 'list', '--porcelain']).match(/^worktree /gm),
        ).toHaveLength(1);
      });
      it('resolves the consumer root from a subfolder', () => {
        expect(subfolder.status, subfolder.output).toBe(1);
        expect(summary('subfolder').overallStatus).toBe('completed');
        expect(findings('subfolder')).toEqual(findings('dirty'));
      });
      it('supports --all with the packed prettier analyzer', () => {
        expect(snapshot.status, snapshot.output).toBe(1);
        expect(snapshot.output).toEqual(expectedSnapshotOutput);
      });
      it('fixes the consumer Prettier violation with --fix', () => {
        expect(fixed.status, fixed.output).toBe(0);
        expect(readFileSync(path.join(root, 'src/main/example.ts'), 'utf8')).toBe(
          'export function example() {\n  debugger;\n  return 1;\n}\n',
        );
      });
    });
  }
});
