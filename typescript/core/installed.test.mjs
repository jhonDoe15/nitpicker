import { execFileSync } from 'node:child_process';
import { lstatSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  checked,
  command,
  createConsumer,
  packNitpicker,
  write,
} from '../../evals/lib/consumer.mjs';

const enabled = process.env.NITPICKER_INSTALLED_TEST === '1';
const packageRoot = path.resolve(import.meta.dirname, '..');
const manifest = JSON.parse(readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
const layouts = [undefined, 'nested', 'linked'];
const cleanSource = 'export function example() {\n  return 1;\n}\n';
const violation = 'export function example(){\n  debugger;\n  return 1\n}\n';

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
  let tarball;
  let cleanupPack;
  beforeAll(() => {
    ({ tarball, cleanup: cleanupPack } = packNitpicker(packageRoot));
  }, 180_000);
  afterAll(() => {
    cleanupPack?.();
  });

  for (const strategy of layouts) {
    describe(strategy ?? 'hoisted', () => {
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
        root = mkdtempSync(path.join(tmpdir(), `nitpicker-consumer-${strategy ?? 'hoisted'}-`));
        createConsumer({
          root,
          tarball,
          manifest,
          strategy,
          files: {
            'src/main/example.ts': cleanSource,
            'test/example.test.ts': 'export const placeholder = true;\n',
          },
        });
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
      }, 120_000);

      it('installs a packed tarball with the requested dependency layout', () => {
        expect(realpathSync(packageLocation)).not.toBe(realpathSync(packageRoot));
        if (!strategy) {
          const eslint = path.dirname(
            execFileSync(
              process.execPath,
              ['-p', 'require.resolve("eslint/package.json", {paths: [process.cwd()]})'],
              { cwd: root, encoding: 'utf8' },
            ).trim(),
          );
          expect(eslint.startsWith(realpathSync(packageLocation) + path.sep)).toBe(false);
        }
      });
      it('exits zero on clean branch and reports both new findings on dirty branch', () => {
        expect(clean.status, clean.output).toBe(0);
        expect(dirty.status, dirty.output).toBe(1);
        expect(summary('dirty').overallStatus).toBe('completed');
        expect(findings('dirty')).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ tool: 'prettier-format', path: 'src/main/example.ts' }),
            expect.objectContaining({
              tool: 'eslint-lint',
              rule: 'no-debugger',
              path: 'src/main/example.ts',
            }),
          ]),
        );
        expect(dirty.output).toContain('example.ts');
      });
      it('records pinned owned tool versions and the installed TypeScript peer', () => {
        const versions = Object.fromEntries(
          summary('dirty').tools.map(({ name, version }) => [name, version]),
        );
        expect(versions['prettier-format']).toBe(manifest.dependencies.prettier);
        expect(versions['eslint-lint']).toBe(
          `eslint@${manifest.dependencies.eslint};typescript@${manifest.devDependencies.typescript}`,
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
        expect(snapshot.output).toContain('src/main/example.ts');
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
