import { spawnSync } from 'node:child_process';
import { cpSync, existsSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  FAREWELL,
  GREETER_TEST,
} from '../../../../languages/java/adapters/java-e2e/test-support/java-preset-data.mjs';
import {
  GREETER_HI,
  GREETER_HI_TEST,
  VIOLATION,
} from '../../../../languages/python/adapters/e2e/test-support/python-preset-data.mjs';
import {
  commitBranch,
  gate,
  initializeRepository,
  installPackages,
  pythonE2eEnabled,
  removeRepositories,
  repository,
  write,
} from '../../../../languages/python/adapters/e2e/test-support/python-e2e-support.mjs';

const languages = path.resolve(import.meta.dirname, '../../../../languages');
const PACKAGES = ['-e', '.', 'coverage', 'mypy', 'pytest', 'ruff'];

const ROOT_FILES = {
  '.gitignore':
    '.venv/\nnode_modules/\nbuild/\n.gradle/\n__pycache__/\n.mypy_cache/\n.ruff_cache/\n',
  'nitpicker.shared.json': JSON.stringify({ thresholds: { fileLines: 300 } }),
  'nitpicker.config.json': JSON.stringify({ projects: ['web', 'api', 'svc'] }),
  'web/package.json': JSON.stringify({
    name: 'web',
    version: '1.0.0',
    private: true,
    type: 'module',
    devDependencies: { typescript: '6.0.3' },
  }),
  'web/nitpicker.config.json': JSON.stringify({
    extends: '../nitpicker.shared.json',
    disable: ['typescript-typecheck', 'coverage', 'crap', 'mutation'],
  }),
  'web/src/greeting.ts':
    'export function greeting(name: string): string {\n  return `Hello, ${name}!`;\n}\n',
};

function summaryOf(result) {
  return result.json('summary.json');
}

function linesStarting(result, prefix) {
  return result.text.split('\n').filter((line) => line.startsWith(prefix));
}

function statuses(result) {
  return Object.fromEntries(
    summaryOf(result).projects.map(({ path: folder, status }) => [folder, status]),
  );
}

const NPM_INSTALL_TIMEOUT_MS = 300_000;

function installWebPackages(root) {
  const result = spawnSync('npm', ['install', '--no-audit', '--no-fund'], {
    cwd: path.join(root, 'web'),
    encoding: 'utf8',
    timeout: NPM_INSTALL_TIMEOUT_MS,
  });
  if (result.status !== 0 || !existsSync(path.join(root, 'web/node_modules'))) {
    throw new Error(`npm install failed: ${result.stderr}${result.stdout}`);
  }
}

describe.skipIf(!pythonE2eEnabled)(
  'a monorepo of a TypeScript package, a Python package and a Gradle module',
  () => {
    let root;

    beforeAll(() => {
      root = repository();
      write(root, ROOT_FILES);
      cpSync(
        path.join(languages, 'python/adapters/fixtures/python-project'),
        path.join(root, 'api'),
        {
          recursive: true,
        },
      );
      write(root, {
        'api/nitpicker.config.json': JSON.stringify({
          extends: '../nitpicker.shared.json',
          preset: 'python',
          disable: ['mutation'],
        }),
      });
      cpSync(
        path.join(languages, 'java/adapters/fixtures/gradle-project'),
        path.join(root, 'svc'),
        {
          recursive: true,
        },
      );
      write(root, { 'svc/nitpicker.config.json': JSON.stringify({ preset: 'java' }) });
      installWebPackages(root);
      initializeRepository(root, 'base');
      installPackages(path.join(root, 'api'), PACKAGES);
      commitBranch(root, 'web-and-api', {
        'web/src/greeting.ts':
          'export function greeting(name: string): string {\n  return `Hi, ${name}!`;\n}\n',
        'api/src/demo/greeter.py': GREETER_HI,
        'api/tests/test_greeter.py': GREETER_HI_TEST,
        'api/src/demo/extra.py': VIOLATION,
      });
      commitBranch(root, 'svc-only', {
        'svc/src/main/java/demo/Greeter.java': FAREWELL,
        'svc/src/test/java/demo/GreeterTest.java': GREETER_TEST,
      });
    });

    afterAll(() => {
      removeRepositories();
    });

    it('gates the touched packages with one command, skips the Gradle module and reports one result', () => {
      const result = gate(root, 'web-and-api');

      expect(statuses(result)).toEqual({ web: 'passed', api: 'failed', svc: 'skipped' });
      expect(result.exitCode).toBe(1);
      expect(summaryOf(result).overallStatus).toBe('completed');
      expect(summaryOf(result).counts).toEqual({
        projects: 3,
        run: 2,
        passed: 1,
        failed: 1,
        errored: 0,
        incomplete: 0,
        skipped: 1,
      });
      expect(summaryOf(result).newEnforceableFindings).toBeGreaterThan(0);
      expect(existsSync(path.join(result.reports, 'api/new-findings.json'))).toBe(true);
      expect(existsSync(path.join(result.reports, 'svc/summary.json'))).toBe(false);
      expect(
        result
          .json('api/new-findings.json')
          .some(
            ({ path: file, classification }) =>
              file.endsWith('extra.py') && classification === 'enforceable',
          ),
      ).toBe(true);
      expect(linesStarting(result, '== ')).toEqual([
        '== web (typescript) ==',
        '== api (python) ==',
      ]);
      expect(linesStarting(result, 'Monorepo summary:')).toEqual([
        'Monorepo summary: 1 failed, 1 passed, 1 skipped (3 projects)',
      ]);
    });

    it('runs the Gradle module when it changes and skips the others', () => {
      const result = gate(root, 'svc-only');

      expect(statuses(result)).toEqual({ web: 'skipped', api: 'skipped', svc: 'passed' });
      expect(result.exitCode).toBe(0);
      expect(linesStarting(result, '== ')).toEqual(['== svc (java) ==']);
      expect(result.json('svc/summary.json').tools.length).toBeGreaterThan(0);
    });

    it('runs only the projects named with --project, changed or not', () => {
      const result = gate(root, 'svc-only', { extra: ['--project', 'web'] });

      expect(statuses(result)).toEqual({ web: 'passed', api: 'skipped', svc: 'skipped' });
      expect(result.exitCode).toBe(0);
    });
  },
);
