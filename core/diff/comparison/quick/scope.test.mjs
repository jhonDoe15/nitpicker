import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { writeFiles } from '../../git/test-support/fixture-files.mjs';
import { scopeToTouchedFiles } from './scope.mjs';

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function projectWith(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-quick-scope-'));
  roots.push(root);
  writeFiles(root, Object.fromEntries(files.map((file) => [file, 'x\n'])));
  return root;
}

function analyzer(name, extra = {}) {
  return {
    name,
    configurationHash: `${name}-hash`,
    resolveConfigurationHash: (root) => `${name}-${root}`,
    createInvocation: () => ({
      command: 'node',
      args: ['runner.mjs', '--fix', '--pattern', 'src/**/*.ts', '--pattern', '*.json'],
      cwd: '.',
    }),
    ...extra,
  };
}

describe('scopeToTouchedFiles', () => {
  it('points the file-local analyzers at the changed files their patterns cover', () => {
    const projectRoot = projectWith(['src/a.ts', 'src/[id].ts', 'package.json', 'docs/b.md']);
    const touched = new Set([
      'src/a.ts',
      'src/[id].ts',
      'src/deleted.ts',
      'docs/b.md',
      'package.json',
    ]);

    const [scoped] = scopeToTouchedFiles([analyzer('eslint-errors')], touched);

    expect(scoped.createInvocation({ projectRoot }).args).toEqual([
      'runner.mjs',
      '--fix',
      '--pattern',
      'package.json',
      '--pattern',
      String.raw`src/\[id\].ts`,
      '--pattern',
      'src/a.ts',
    ]);
  });

  it('reports no findings without starting the tool when no changed file is covered', () => {
    const projectRoot = projectWith(['docs/b.md']);
    const [scoped] = scopeToTouchedFiles([analyzer('prettier-format')], new Set(['docs/b.md']));

    const invocation = scoped.createInvocation({ projectRoot });

    expect(invocation).toEqual({
      command: 'node',
      args: [
        '--input-type=module',
        '--eval',
        String.raw`process.stdout.write(JSON.stringify({ findings: [] }) + '\n');`,
      ],
      cwd: '.',
    });
  });

  it('keys a scoped analyzer by the changed files', () => {
    const [first] = scopeToTouchedFiles([analyzer('eslint-logging')], new Set(['src/a.ts']));
    const [second] = scopeToTouchedFiles([analyzer('eslint-logging')], new Set(['src/b.ts']));

    expect(first.configurationHash).not.toBe('eslint-logging-hash');
    expect(first.configurationHash).not.toBe(second.configurationHash);
    expect(first.resolveConfigurationHash('/policy')).not.toBe(
      second.resolveConfigurationHash('/policy'),
    );
  });

  it('leaves the project-wide and custom analyzers alone', () => {
    const analyzers = [
      analyzer('eslint-lint'),
      analyzer('typescript-typecheck'),
      analyzer('eslint-errors', { custom: true }),
    ];

    expect(scopeToTouchedFiles(analyzers, new Set(['src/a.ts']))).toEqual(analyzers);
  });
});
