import { execFileSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { PACKAGE_ROOT } from './tooling/tool-resolution.mjs';

const root = PACKAGE_ROOT;

const TEST_ONLY_PATH =
  /(?:^|\/)(?:fixtures|test-support|__tests__|__pycache__)\/|\.test\.mjs$|_test\.go$|\.pyc$/u;
const GENERATOR_ONLY_PATH = new RegExp(
  [
    '^core/reference/',
    '^shared/reference/(?:build|checks)/',
    '^languages/[^/]+/reference/',
    '^languages/python/ruff/ruff-rules\\.json$',
  ].join('|'),
  'u',
);

function isNotShipped(relative) {
  return TEST_ONLY_PATH.test(relative) || GENERATOR_ONLY_PATH.test(relative);
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
  it('classifies test-only paths, Go test files, generator-only reference sources and Python bytecode by folder and file name', () => {
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
        'core/reference/render.mjs',
        'core/command/reference/reference.mjs',
        'shared/reference/checks/check-entries.mjs',
        'shared/reference/build/text.mjs',
        'shared/reference/rules/java-pmd.json',
        'languages/java/reference/tool-text/pmd.json',
        'languages/typescript/reference/eslint-inventory.json',
        'languages/python/ruff/ruff-rules.json',
        'languages/java/reference/kotlin/detekt-default-rules.json',
        'languages/go/inspect/inspect_test.go',
        'languages/go/inspect/body.go',
      ].filter(isNotShipped),
    ).toEqual([
      'core/cli.test.mjs',
      'core/diff/fixtures/fake-eslint-cli.mjs',
      'core/command/test-support/cli-harness.mjs',
      'languages/java/adapters/java-e2e/__tests__/java-preset-project.mjs',
      'languages/java/adapters/fixtures/fake-gradle.mjs',
      'languages/python/metrics/__pycache__/class_metrics.cpython-313.pyc',
      'core/reference/render.mjs',
      'shared/reference/checks/check-entries.mjs',
      'shared/reference/build/text.mjs',
      'languages/java/reference/tool-text/pmd.json',
      'languages/typescript/reference/eslint-inventory.json',
      'languages/python/ruff/ruff-rules.json',
      'languages/java/reference/kotlin/detekt-default-rules.json',
      'languages/go/inspect/inspect_test.go',
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
    expect(packedFiles.has('shared/reference/rules/java-pmd.json')).toBe(true);
    expect(packedFiles.has('core/command/reference/reference.mjs')).toBe(true);
    expect(packedFiles.has('languages/go/inspect/go.mod')).toBe(true);
    expect(packedFiles.has('languages/go/inspect/main.go')).toBe(true);
    expect(
      [...packedFiles].filter((file) => isNotShipped(file) || file === 'package-lock.json'),
    ).toEqual([]);
  });
});
