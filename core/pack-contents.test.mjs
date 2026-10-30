import { execFileSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { PACKAGE_ROOT } from './tooling/tool-resolution.mjs';

const root = PACKAGE_ROOT;

const NOT_SHIPPED_PATH =
  /(?:^|\/)(?:fixtures|test-support|__tests__|__pycache__)\/|\.test\.mjs$|\.pyc$/u;

function isNotShipped(relative) {
  return NOT_SHIPPED_PATH.test(relative);
}

function sourceFiles(directory) {
  return readdirSync(path.join(root, directory), {
    withFileTypes: true,
  }).flatMap((entry) => {
    const relative = `${directory}/${entry.name}`;
    if (isNotShipped(`${relative}${entry.isDirectory() ? '/' : ''}`)) return [];
    if (entry.isDirectory()) {
      return sourceFiles(relative);
    }
    if (entry.name === 'README.md') return [];
    return statSync(path.join(root, relative)).isFile() ? [relative] : [];
  });
}

function assertRuntimeFiles(files) {
  const expected = ['package.json', ...['core', 'shared', 'languages'].flatMap(sourceFiles)];
  expect(
    expected.filter((relative) => !files.has(relative)),
    'missing runtime file',
  ).toEqual([]);
}

describe('npm package contents', () => {
  let packedFiles;

  beforeAll(() => {
    let listing;
    try {
      listing = JSON.parse(
        execFileSync('npm', ['pack', '--dry-run', '--json'], {
          cwd: root,
          encoding: 'utf8',
        }),
      );
    } catch (error) {
      throw new Error('npm pack did not return a valid listing', {
        cause: error,
      });
    }

    packedFiles = new Set(listing[0].files.map(({ path: file }) => file));
  });

  it('fails when a runtime file is omitted from files', () => {
    const files = new Set(['package.json']);
    expect(() => {
      assertRuntimeFiles(files);
    }).toThrow('missing runtime file');
  });
  it('classifies test-only paths and Python bytecode by folder and file name', () => {
    expect(
      [
        'core/cli.mjs',
        'core/cli.test.mjs',
        'core/diff/fixtures/fake-eslint-cli.mjs',
        'core/command/test-support/cli-harness.mjs',
        'languages/java/adapters/java-e2e/__tests__/java-preset-project.mjs',
        'languages/java/adapters/fixtures/fake-gradle.mjs',
        'core/diff/execution/analyzer-scheduler.mjs',
        'languages/python/metrics/__pycache__/class_metrics.cpython-313.pyc',
        'languages/python/metrics/class_metrics.py',
      ].filter(isNotShipped),
    ).toEqual([
      'core/cli.test.mjs',
      'core/diff/fixtures/fake-eslint-cli.mjs',
      'core/command/test-support/cli-harness.mjs',
      'languages/java/adapters/java-e2e/__tests__/java-preset-project.mjs',
      'languages/java/adapters/fixtures/fake-gradle.mjs',
      'languages/python/metrics/__pycache__/class_metrics.cpython-313.pyc',
    ]);
  });
  it('ships the complete runtime tree without tests, fixtures, test support, bytecode or the lockfile', () => {
    assertRuntimeFiles(packedFiles);
    expect(packedFiles.has('core/fix/run-fix.mjs')).toBe(true);
    expect(packedFiles.has('languages/java/gradle/nitpicker.init.gradle')).toBe(true);
    expect(packedFiles.has('languages/java/detekt/nitpicker-detekt.yml')).toBe(true);
    expect(packedFiles.has('languages/python/ruff/nitpicker-ruff.toml')).toBe(true);
    expect(packedFiles.has('languages/python/adapters/python-runner.mjs')).toBe(true);
    expect(packedFiles.has('languages/python/ingest/coverage-reports/coverage-json.mjs')).toBe(
      true,
    );
    expect(packedFiles.has('languages/java/gradle/checkstyle-suppressions.xml')).toBe(true);
    expect(packedFiles.has('languages/python/rules/nitpicker_rules.py')).toBe(true);
    expect(packedFiles.has('languages/python/rules/rule-hints.mjs')).toBe(true);
    expect(packedFiles.has('languages/python/metrics/structure_metrics.py')).toBe(true);
    expect(packedFiles.has('languages/python/adapters/import-scan.py')).toBe(true);
    expect(packedFiles.has('languages/java/gradle/spring-ruleset.xml')).toBe(true);
    expect(packedFiles.has('languages/java/gradle/pmd-ruleset.xml')).toBe(true);
    expect(packedFiles.has('core/init/templates/github-workflow.yml')).toBe(true);
    expect(packedFiles.has('docs/agents-snippet.md')).toBe(true);
    expect(
      [...packedFiles].filter((file) => isNotShipped(file) || file === 'package-lock.json'),
    ).toEqual([]);
  });
});
