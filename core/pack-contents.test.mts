import { execFileSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fieldAt } from '../scripts/json/fields.mts';
import { listOf, parseJson, textOf } from '../shared/values/readers.mts';
import { PAGE_IDS as UNTYPED_PAGE_IDS } from '../shared/reference/pages.mjs';
import { REFERENCE_DATA_DIRECTORY as UNTYPED_DATA_DIRECTORY } from '../shared/reference/store.mjs';
import { PACKAGE_ROOT as untypedPackageRoot } from './tooling/tool-resolution.mjs';

const root: string = untypedPackageRoot;
const PAGE_IDS: readonly string[] = UNTYPED_PAGE_IDS;
const REFERENCE_DATA_DIRECTORY: string = UNTYPED_DATA_DIRECTORY;
const EMIT = 'scripts/typescript/emit.mjs';
const RULE_DATA = PAGE_IDS.map((id) => `${REFERENCE_DATA_DIRECTORY}/${id}.json`);
const PREPACK = `node ${EMIT} && node scripts/reference/gen-rules.mjs --data`;

const TEST_ONLY_PATH =
  /(?:^|\/)(?:fixtures|test-support|__tests__|__pycache__)\/|\.test\.m[jt]s$|_test\.go$|\.pyc$/u;
const GENERATOR_ONLY_PATH = new RegExp(
  [
    '^core/reference/',
    '^shared/reference/(?:build|checks)/',
    '^languages/[^/]+/reference/',
    '^languages/python/ruff/ruff-rules\\.json$',
    '^languages/java/gradle/rulesets/',
  ].join('|'),
  'u',
);

function isNotShipped(relative: string): boolean {
  return TEST_ONLY_PATH.test(relative) || GENERATOR_ONLY_PATH.test(relative);
}

function sourceFiles(directory: string): string[] {
  return readdirSync(path.join(root, directory), {
    withFileTypes: true,
  }).flatMap((entry) => {
    const relative = `${directory}/${entry.name}`;
    if (isNotShipped(`${relative}${entry.isDirectory() ? '/' : ''}`)) return [];
    if (entry.isDirectory()) {
      return sourceFiles(relative);
    }
    if (entry.name === 'README.md') return [];
    return statSync(path.join(root, relative)).isFile()
      ? [relative.replace(/\.mts$/u, '.mjs')]
      : [];
  });
}

function assertRuntimeFiles(files: ReadonlySet<string>): void {
  const expected = ['package.json', ...['core', 'shared', 'languages'].flatMap(sourceFiles)];
  expect(
    expected.filter((relative) => !files.has(relative)),
    'missing runtime file',
  ).toEqual([]);
}

const HERMETIC_GIT = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };

function checkoutCopy(): string {
  const missing = RULE_DATA.filter((file) => !existsSync(path.join(root, file)));
  if (missing.length > 0) {
    throw new Error(`${missing.join(', ')} missing: run npm run gen:rules -- --data`);
  }
  const copy = mkdtempSync(path.join(tmpdir(), 'nitpicker-pack-contents-'));
  const files = execFileSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    {
      cwd: root,
      encoding: 'utf8',
      env: HERMETIC_GIT,
      timeout: 30_000,
    },
  )
    .split('\0')
    .filter((file) => file !== '' && existsSync(path.join(root, file)));
  for (const file of files) {
    cpSync(path.join(root, file), path.join(copy, file));
  }
  for (const file of RULE_DATA) {
    cpSync(path.join(root, file), path.join(copy, file));
  }
  symlinkSync(path.join(root, 'node_modules'), path.join(copy, 'node_modules'), 'junction');
  return copy;
}

describe('npm package contents', () => {
  let packedFiles: ReadonlySet<string>;
  let copy: string | undefined;

  afterAll(() => {
    if (copy !== undefined) {
      rmSync(copy, { recursive: true, force: true });
    }
  });

  beforeAll(() => {
    let listing: unknown;
    const packed = checkoutCopy();
    copy = packed;
    try {
      execFileSync(process.execPath, [EMIT], { cwd: packed, stdio: 'pipe', timeout: 120_000 });
      listing = parseJson(
        execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
          cwd: packed,
          encoding: 'utf8',
          timeout: 120_000,
        }),
      );
    } catch (error) {
      throw new Error('Building the npm pack listing failed', {
        cause: error,
      });
    }

    packedFiles = new Set(
      listOf(fieldAt(listing, 0, 'files')).map((file) => textOf(fieldAt(file, 'path'))),
    );
  });

  it('replays prepack: the emit runs in the copy, the rule data comes from the global setup', () => {
    const manifest = parseJson(readFileSync(path.join(root, 'package.json'), 'utf8'));
    expect(
      fieldAt(manifest, 'scripts', 'prepack'),
      'replay new prepack steps in the listing hook',
    ).toBe(PREPACK);
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
        'core/cli.test.mts',
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
      'core/cli.test.mts',
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
    expect(packedFiles.has('core/bin.mjs')).toBe(true);
    expect(packedFiles.has('shared/logic/sync/decide-worker.mjs')).toBe(true);
    expect([...packedFiles].filter((file) => file.endsWith('.mts'))).toEqual([]);
    expect(packedFiles.has('core/tooling/node-version/node-version.mjs')).toBe(true);
    expect(packedFiles.has('core/fix/run-fix.mjs')).toBe(true);
    expect(packedFiles.has('CHANGELOG.md')).toBe(true);
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
    expect(packedFiles.has('languages/java/gradle/security/exclude.xml')).toBe(true);
    expect(packedFiles.has('languages/java/gradle/security/jakarta-sinks.txt')).toBe(true);
    expect(packedFiles.has('languages/java/gradle/security/spring-jdbc-sinks.txt')).toBe(true);
    expect(packedFiles.has('languages/java/gradle/security/path-sinks.txt')).toBe(true);
    expect(packedFiles.has('core/init/templates/github-workflow.yml')).toBe(true);
    expect(packedFiles.has('docs/agents-snippet.md')).toBe(true);
    expect(packedFiles.has('spec/config.schema.json')).toBe(true);
    expect(packedFiles.has('spec/findings.schema.json')).toBe(true);
    expect(packedFiles.has('spec/json-output.schema.json')).toBe(true);
    expect(packedFiles.has('shared/reference/rules/java-pmd.json')).toBe(true);
    expect(packedFiles.has('core/command/reference/reference.mjs')).toBe(true);
    expect(packedFiles.has('languages/go/inspect/go.mod')).toBe(true);
    expect(packedFiles.has('languages/go/inspect/main.go')).toBe(true);
    expect(
      [...packedFiles].filter((file) => isNotShipped(file) || file === 'package-lock.json'),
    ).toEqual([]);
  });
});
