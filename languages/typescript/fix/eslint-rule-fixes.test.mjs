import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { fixtureGit, useGitFixtures } from '../../../core/diff/git/test-support/git-repository.mjs';
import { writeFiles } from '../../../core/diff/git/test-support/fixture-files.mjs';
import { fixWorkingTree } from '../../../core/fix/run-fix.mts';

const { createGitRepository } = useGitFixtures();

const environmentDirective = (name) => ['/** @vitest', `-environment ${name} */`].join('');

const HOLE = ['$', '{directory}'].join('');

const COMMITTED = {
  'package.json': '{ "name": "demo", "type": "module" }\n',
  'tsconfig.json': JSON.stringify({
    compilerOptions: {
      strict: true,
      module: 'esnext',
      moduleResolution: 'bundler',
      target: 'ES2023',
      lib: ['ES2023'],
      types: [],
      noEmit: true,
    },
    include: ['src', 'tests'],
  }),
};

const SAFE_INPUT = {
  'src/main/feature.ts': [
    '// state the intent in a name',
    'export function wrap(run: () => void): void {',
    '  try {',
    '    run();',
    '  } catch (error) {',
    "    throw new Error('failed');",
    '  }',
    '}',
    '',
  ].join('\n'),
  'src/main/features/orders/domain/sorted.ts': [
    'export function sortedNames(names: readonly string[]): readonly string[] {',
    "  return [...names]['sort']();",
    '}',
    '',
  ].join('\n'),
  'tests/sample.test.ts': [
    environmentDirective('jsdom'),
    "import { execFileSync } from 'node:child_process';",
    '',
    'type Container = { stop(): Promise<void>; pause(): Promise<void>; unpause(): Promise<void> };',
    'const container: Container = {',
    '  stop: () => Promise.resolve(),',
    '  pause: () => Promise.resolve(),',
    '  unpause: () => Promise.resolve(),',
    '};',
    'function probe(): Promise<void> {',
    '  return Promise.resolve();',
    '}',
    'function teardownContainer(target: Container): Promise<void> {',
    '  return target.stop();',
    '}',
    'function withPausedContainer(target: Container, work: () => Promise<void>): Promise<void> {',
    '  return target.pause().then(work);',
    '}',
    '',
    'vi.useFakeTimers();',
    '',
    'const tsconfig = JSON.stringify({ compilerOptions: { strict: true } });',
    '',
    "describe('sample', () => {",
    "  it('runs git', { retry: 2 }, () => {",
    "    const out = execFileSync('git', ['status'], { env: { PATH: '/bin' }, timeout: 5000 });",
    '    expect(out).toBeDefined();',
    '    expect(tsconfig).toBeDefined();',
    '  });',
    '});',
    '',
    'afterAll(async () => {',
    '  await container.stop();',
    '});',
    '',
    "it('pauses', async () => {",
    '  await container.pause();',
    '  await probe();',
    '  await container.unpause();',
    '});',
    '',
  ].join('\n'),
};

const SAFE_OUTPUT = {
  'src/main/feature.ts': [
    'export function wrap(run: () => void): void {',
    '  try {',
    '    run();',
    '  } catch (error) {',
    "    throw new Error('failed', { cause: error });",
    '  }',
    '}',
    '',
  ].join('\n'),
  'src/main/features/orders/domain/sorted.ts': [
    'export function sortedNames(names: readonly string[]): readonly string[] {',
    "  return [...names]['toSorted']();",
    '}',
    '',
  ].join('\n'),
  'tests/sample.test.ts': [
    environmentDirective('node'),
    "import { execFileSync } from 'node:child_process';",
    '',
    'type Container = { stop(): Promise<void>; pause(): Promise<void>; unpause(): Promise<void> };',
    'const container: Container = {',
    '  stop: () => Promise.resolve(),',
    '  pause: () => Promise.resolve(),',
    '  unpause: () => Promise.resolve(),',
    '};',
    'function probe(): Promise<void> {',
    '  return Promise.resolve();',
    '}',
    'function teardownContainer(target: Container): Promise<void> {',
    '  return target.stop();',
    '}',
    'function withPausedContainer(target: Container, work: () => Promise<void>): Promise<void> {',
    '  return target.pause().then(work);',
    '}',
    '',
    'vi.useFakeTimers();',
    '',
    'afterEach(() => {',
    '  vi.useRealTimers();',
    '});',
    '',
    "const tsconfig = JSON.stringify({ compilerOptions: { strict: true, types: [], lib: ['ES2022'] } });",
    '',
    "describe('sample', () => {",
    "  it('runs git', {}, () => {",
    "    const out = execFileSync('git', ['status'], {",
    "      env: { PATH: '/bin', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' },",
    '      timeout: 5000,',
    '    });',
    '    expect(out).toBeDefined();',
    '    expect(tsconfig).toBeDefined();',
    '  });',
    '});',
    '',
    'afterAll(async () => {',
    '  await teardownContainer(container);',
    '});',
    '',
    "it('pauses', async () => {",
    '  await withPausedContainer(container, async () => {',
    '    await probe();',
    '  });',
    '});',
    '',
  ].join('\n'),
};

const REVIEW_INPUT = {
  'src/main/features/orders/adapters/net.ts': [
    "import { execFile, exec } from 'node:child_process';",
    "import https from 'node:https';",
    '',
    'export function limit(max: number | undefined): number {',
    '  return max || 10;',
    '}',
    '',
    'export async function load(url: string): Promise<Response> {',
    '  return await fetch(url);',
    '}',
    '',
    'export function connect(host: string): void {',
    '  https.get(host, { rejectUnauthorized: false }, () => undefined);',
    '}',
    '',
    'export function list(directory: string): void {',
    `  exec(\`ls ${HOLE}\`, () => undefined);`,
    "  execFile('ls', [], () => undefined);",
    '}',
    '',
  ].join('\n'),
  'tests/slow.test.ts': [
    "import { spawnSync } from 'node:child_process';",
    '',
    "it('waits', () => {",
    "  expect(spawnSync('tool', ['--version']).status).toBe(0);",
    '}, 60000);',
    '',
  ].join('\n'),
};

const REVIEW_OUTPUT = {
  'src/main/features/orders/adapters/net.ts': [
    "import { execFile, exec } from 'node:child_process';",
    "import https from 'node:https';",
    '',
    'export function limit(max: number | undefined): number {',
    '  return max ?? 10;',
    '}',
    '',
    'export async function load(url: string): Promise<Response> {',
    '  return await fetch(url, { signal: AbortSignal.timeout(10000) });',
    '}',
    '',
    'export function connect(host: string): void {',
    '  https.get(host, {}, () => undefined);',
    '}',
    '',
    'export function list(directory: string): void {',
    "  execFile('ls', [String(directory)], () => undefined);",
    "  execFile('ls', [], () => undefined);",
    '}',
    '',
  ].join('\n'),
  'tests/slow.test.ts': [
    "import { spawnSync } from 'node:child_process';",
    '',
    "it('waits', () => {",
    "  expect(spawnSync('tool', ['--version'], { timeout: 10000 }).status).toBe(0);",
    '});',
    '',
  ].join('\n'),
};

const REVIEW_RULES = [
  'eslint-lint/nitpicker/no-falsy-default',
  'eslint-lint/nitpicker/require-http-timeout',
  'eslint-lint/nitpicker/no-disabled-tls-verification',
  'eslint-lint/nitpicker/no-shell-string-command',
  'eslint-lint/nitpicker/require-test-process-timeout',
  'eslint-lint/nitpicker/no-raised-test-timeout',
];

function topic(changed) {
  const repository = createGitRepository(COMMITTED, { baseRef: 'base' });
  fixtureGit(repository.root, ['checkout', '-q', '-b', 'topic']);
  writeFiles(repository.root, changed);
  return repository;
}

function fix(repository, selectedRules) {
  const result = fixWorkingTree({
    repositoryRoot: repository.root,
    projectRoot: repository.root,
    baseRef: 'base',
    ...(selectedRules === undefined ? {} : { selectedRules }),
  });
  const read = (name) => readFileSync(path.join(repository.root, name), 'utf8');
  return { result, read };
}

describe('the fixes of nitpicker own ESLint rules', () => {
  it('applies one fix per safe rule with a plain fix and leaves the review rules alone', () => {
    const repository = topic({ ...SAFE_INPUT, ...REVIEW_INPUT });
    const { result, read } = fix(repository);

    expect(result.toolErrors).toEqual([]);
    expect(Object.fromEntries(Object.keys(SAFE_OUTPUT).map((name) => [name, read(name)]))).toEqual(
      SAFE_OUTPUT,
    );
    expect(read('tests/slow.test.ts')).toBe(REVIEW_INPUT['tests/slow.test.ts']);
    expect(read('src/main/features/orders/adapters/net.ts')).toBe(
      REVIEW_INPUT['src/main/features/orders/adapters/net.ts'],
    );
  });
  it('applies the suggestion of each selected review rule and nothing else', () => {
    const repository = topic({ ...SAFE_INPUT, ...REVIEW_INPUT });
    const { result, read } = fix(repository, REVIEW_RULES);

    expect(result.toolErrors).toEqual([]);
    expect(
      Object.fromEntries(Object.keys(REVIEW_OUTPUT).map((name) => [name, read(name)])),
    ).toEqual(REVIEW_OUTPUT);
    expect(read('src/main/feature.ts')).toBe(SAFE_INPUT['src/main/feature.ts']);
  });
  it('applies the logging rule fix from the logging check that plain --fix runs too', () => {
    const repository = createGitRepository(
      { ...COMMITTED, 'package.json': '{ "name": "demo", "dependencies": { "pino": "9.0.0" } }\n' },
      { baseRef: 'base' },
    );
    fixtureGit(repository.root, ['checkout', '-q', '-b', 'topic']);
    writeFiles(repository.root, {
      'src/main/log.ts': [
        "import pino from 'pino';",
        '',
        'const logger = pino();',
        '',
        'export function run(work: () => void): void {',
        '  try {',
        '    work();',
        '  } catch (error) {',
        "    logger.error('failed', error);",
        '  }',
        '}',
        '',
      ].join('\n'),
    });
    const { result, read } = fix(repository);

    expect(result.toolErrors).toEqual([]);
    expect(read('src/main/log.ts').split('\n')[8]).toBe(
      "    logger.error({ err: error }, 'failed');",
    );
  });
});
