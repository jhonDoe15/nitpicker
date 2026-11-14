import { describe, expect, it } from 'vitest';
import { useGitFixtures } from '../../git/test-support/git-repository.mts';
import { writeFiles } from '../../git/test-support/fixture-files.mts';
import { fieldOf } from '../../../../shared/values/readers.mts';
import type { ProfiledAnalyzer } from '../../../../shared/values/analyzers.mts';
import { scopeToTouchedFiles } from './scope.mts';

const { temporaryRoot: fixtureRoot } = useGitFixtures();

function projectWith(files: readonly string[]): string {
  const root = fixtureRoot('nitpicker-quick-scope-');
  writeFiles(root, Object.fromEntries(files.map((file) => [file, 'x\n'])));
  return root;
}

function analyzer(name: string, extra: Partial<ProfiledAnalyzer> = {}): ProfiledAnalyzer {
  return {
    name,
    configurationHash: `${name}-hash`,
    resolveConfigurationHash: (root: string) => `${name}-${root}`,
    createInvocation: () => ({
      command: 'node',
      args: ['runner.mjs', '--fix', '--pattern', 'src/**/*.ts', '--pattern', '*.json'],
      cwd: '.',
    }),
    ...extra,
  };
}

function isProfiled(value: unknown): value is ProfiledAnalyzer {
  return (
    typeof fieldOf(value, 'name') === 'string' &&
    typeof fieldOf(value, 'createInvocation') === 'function'
  );
}

function scopedFirst(name: string, touched: Set<string>): ProfiledAnalyzer {
  const [scoped] = scopeToTouchedFiles([analyzer(name)], touched);
  if (!isProfiled(scoped)) {
    throw new TypeError(`${name} was not scoped to an analyzer`);
  }
  return scoped;
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

    const scoped = scopedFirst('eslint-errors', touched);

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
    const scoped = scopedFirst('prettier-format', new Set(['docs/b.md']));

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
    const first = scopedFirst('eslint-logging', new Set(['src/a.ts']));
    const second = scopedFirst('eslint-logging', new Set(['src/b.ts']));

    expect(first.configurationHash).not.toBe('eslint-logging-hash');
    expect(first.configurationHash).not.toBe(second.configurationHash);
    expect(first.resolveConfigurationHash?.('/policy')).not.toBe(
      second.resolveConfigurationHash?.('/policy'),
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
