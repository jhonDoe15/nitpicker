import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { useGitFixtures } from '../../core/diff/git/test-support/git-repository.mts';
import { HEAD_POLICY_ENV } from '../head-policy.mts';
import { configurationFiles, createHygieneAnalyzers } from './analyzers.mts';
import { parseCheckArguments } from './cli.mts';
import { runHygieneCheck, runHygieneCli } from './runner.mts';
import { linkSentence } from '../messages/test-support/link-sentence.mts';
import { yamlDocuments } from '../../core/tooling/yaml/yaml-documents.mts';
import { fieldOf, listOf, parseJson } from '../values/readers.mts';
import type { HygienePolicy, ParseYaml } from './check-types.mts';

const temporaryDirectories: string[] = [];
const { createGitRepository } = useGitFixtures();

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

const FILES = {
  '.env': 'DB_PASSWORD=hunter2\n',
  'vendor/.env': 'DB_PASSWORD=hunter2\n',
  'src/a.ts': 'export {};\n',
};

function findingPaths(stdout: string): unknown[] {
  return listOf(fieldOf(parseJson(stdout), 'findings')).map((finding) => fieldOf(finding, 'path'));
}

describe('runHygieneCheck', () => {
  it('drops excluded paths and excepted findings, and keeps the rest', () => {
    const { root } = createGitRepository(FILES);
    const check = (policy?: HygienePolicy) =>
      runHygieneCheck({ check: 'repository-hygiene', projectRoot: root, policy }).map(
        ({ path: findingPath }) => findingPath,
      );

    expect(check(undefined)).toEqual(['.env', 'vendor/.env']);
    expect(check({ exclude: ['vendor/**'] })).toEqual(['.env']);
    expect(
      check({
        exceptions: [{ rule: 'committed-env-file', paths: ['vendor/**'], reason: 'fixture' }],
      }),
    ).toEqual(['.env']);
    expect(
      check({ exceptions: [{ rule: 'large-file', paths: ['**'], reason: 'other rule' }] }),
    ).toEqual(['.env', 'vendor/.env']);
  });

  it('matches a build output exception against the folder, and reports the manifest', () => {
    const { root } = createGitRepository({
      'svc/package.json': '{"name":"svc"}\n',
      'svc/build/app.class': 'x',
    });
    const check = (paths: string[]) =>
      runHygieneCheck({
        check: 'repository-hygiene',
        projectRoot: root,
        policy: { exceptions: [{ rule: 'committed-build-output', paths, reason: 'fixture' }] },
      });

    expect(check(['other/**'])).toEqual([
      {
        tool: 'repository-hygiene',
        rule: 'committed-build-output',
        path: 'svc/package.json',
        identity: 'svc/build|build-output',
        message:
          'svc/build/ looks like build output tracked in git. Untrack it with `git rm -r --cached svc/build`, ' +
          'add `svc/build/` to .gitignore, and let CI produce it; if it holds sources or build scripts, rename it. ' +
          'If this is intended, add {"rule":"committed-build-output","paths":["svc/build/**"],"reason":"..."} to ' +
          '"exceptions" in nitpicker.config.json.',
        classification: 'enforceable',
      },
    ]);
    expect(check(['svc/build'])).toEqual([]);
  });

  it('rejects a check it does not know', () => {
    const { root } = createGitRepository(FILES);

    expect(() => runHygieneCheck({ check: 'other', projectRoot: root })).toThrow(
      'Unknown hygiene check: other',
    );
  });
});

describe('parseCheckArguments', () => {
  it('reads the named options', () => {
    expect(
      parseCheckArguments(['--check', 'a', '--project-root', '/p', '--history-ref', 'abc']),
    ).toEqual({ check: 'a', projectRoot: '/p', historyRef: 'abc' });
  });

  it.each([
    [['--nope', 'x'], 'hygiene', 'Invalid hygiene argument: --nope'],
    [['--check'], 'hygiene', 'Invalid hygiene argument: --check'],
    [['--nope', 'x'], 'history', 'Invalid history argument: --nope'],
  ])('rejects %j for the %s command', (commandArguments, command, message) => {
    expect(() => parseCheckArguments(commandArguments, command)).toThrow(new Error(message));
  });
});

describe('runHygieneCli', () => {
  function run(commandArguments: string[], policy: HygienePolicy, parseYaml?: ParseYaml) {
    const directory = mkdtempSync(path.join(tmpdir(), 'nitpicker-hygiene-policy-'));
    temporaryDirectories.push(directory);
    const policyFile = path.join(directory, 'policy.json');
    writeFileSync(policyFile, JSON.stringify(policy));
    const output = { stdout: '', stderr: '' };
    const status = runHygieneCli({
      commandArguments,
      stdout: { write: (text) => (output.stdout += text) },
      stderr: { write: (text) => (output.stderr += text) },
      environment: { [HEAD_POLICY_ENV]: policyFile },
      parseYaml,
    });
    return { status, ...output };
  }

  it('prints the findings as JSON and honours the head policy file', () => {
    const { root } = createGitRepository(FILES);
    const result = run(['--check', 'repository-hygiene', '--project-root', root], {
      exclude: ['vendor/**'],
    });

    expect({
      ...result,
      stdout: findingPaths(result.stdout),
    }).toEqual({ status: 0, stdout: ['.env'], stderr: '' });
  });

  it('hands the YAML parser it is given to the checks', () => {
    const { root } = createGitRepository({
      'db/changelog/lines.yaml': [
        'databaseChangeLog:',
        '  - changeSet:',
        '      id: 1',
        '      changes:',
        '        - addForeignKeyConstraint:',
        '            baseTableName: lines',
        '            baseColumnNames: order_id',
        '            referencedTableName: orders',
        '            referencedColumnNames: id',
        '',
      ].join('\n'),
    });
    const paths = (parseYaml?: ParseYaml) =>
      findingPaths(
        run(['--check', 'repository-hygiene', '--project-root', root], {}, parseYaml).stdout,
      );

    expect([paths(yamlDocuments), paths(undefined)]).toEqual([['db/changelog/lines.yaml'], []]);
  });

  it('exits 2 with the cause on bad input', () => {
    expect(run(['--check', 'nope', '--project-root', '/'], {})).toEqual({
      status: 2,
      stdout: '',
      stderr: `Hygiene check failed: Unknown hygiene check: nope. ${String(linkSentence('analyzerCrashed'))}\n`,
    });
  });
});

describe('createHygieneAnalyzers', () => {
  it('runs the repository check on the snapshot it is given', () => {
    const [analyzer, ...others] = createHygieneAnalyzers('/tool/core/cli.mjs');

    expect(others).toEqual([]);
    expect(analyzer?.name).toBe('repository-hygiene');
    expect(analyzer?.configurationHash).toMatch(/^[0-9a-f]{64}$/u);
    expect(analyzer?.createInvocation({ projectRoot: '/head', toolRoot: '/tool' })).toEqual({
      command: process.execPath,
      args: [
        '/tool/core/cli.mjs',
        'hygiene',
        '--check',
        'repository-hygiene',
        '--project-root',
        '/head',
      ],
      cwd: '/tool',
    });
  });

  it('hands the base checkout to the head run only', () => {
    const [analyzer] = createHygieneAnalyzers('/tool/core/cli.mjs');
    const argumentsOf = (snapshot: string) =>
      analyzer?.createInvocation({
        projectRoot: '/side',
        toolRoot: '/tool',
        snapshot,
        baselineRoot: '/base',
      }).args ?? [];

    expect(argumentsOf('head').slice(-2)).toEqual(['--baseline-root', '/base']);
    expect(argumentsOf('base')).not.toContain('--baseline-root');
  });
});

describe('the hygiene configuration hash', () => {
  it('covers every module the runner loads', () => {
    expect(configurationFiles()).toEqual([
      'conventions/lines.mts',
      'filesystem.mts',
      'head-policy.mts',
      'hygiene/check-types.mts',
      'hygiene/cli.mts',
      'hygiene/files/build-output.mts',
      'hygiene/files/env-files.mts',
      'hygiene/files/known-files.mts',
      'hygiene/files/output-sources.mts',
      'hygiene/files/repository-files.mts',
      'hygiene/files/start-scripts.mts',
      'hygiene/limits/classes/declarations.mts',
      'hygiene/limits/classes/field-facts.mts',
      'hygiene/limits/classes/go-structs.mts',
      'hygiene/limits/classes/jvm-classes.mts',
      'hygiene/limits/classes/python-classes.mts',
      'hygiene/limits/classes/typescript-classes.mts',
      'hygiene/limits/columns/changelog-columns.mts',
      'hygiene/limits/columns/column-facts.mts',
      'hygiene/limits/columns/drizzle-columns.mts',
      'hygiene/limits/columns/prisma-columns.mts',
      'hygiene/limits/columns/sql-columns.mts',
      'hygiene/limits/compare.mts',
      'hygiene/limits/fact-types.mts',
      'hygiene/limits/field-limits.mts',
      'hygiene/limits/messages.mts',
      'hygiene/limits/request-bound.mts',
      'hygiene/limits/scanning/enum-names.mts',
      'hygiene/limits/scanning/facts.mts',
      'hygiene/limits/scanning/names.mts',
      'hygiene/limits/scanning/pattern-length.mts',
      'hygiene/limits/scanning/scan.mts',
      'hygiene/limits/spec/generators.mts',
      'hygiene/limits/spec/openapi-limits.mts',
      'hygiene/limits/validators/bounds.mts',
      'hygiene/limits/validators/schema-objects.mts',
      'hygiene/limits/validators/spring-validator.mts',
      'hygiene/migrations/hardcoded-names.mts',
      'hygiene/migrations/migration-files.mts',
      'hygiene/migrations/migration-order.mts',
      'hygiene/migrations/migration-types.mts',
      'hygiene/migrations/revision-graph.mts',
      'hygiene/rules.mts',
      'hygiene/runner.mjs',
      'hygiene/rust/cargo-builds.mts',
      'hygiene/rust/cargo-crates.mts',
      'hygiene/rust/musl-allocators.mts',
      'hygiene/schema/database-kind.mts',
      'hygiene/schema/foreign-key-index.mts',
      'hygiene/schema/migration-schema.mts',
      'hygiene/schema/prisma-schema.mts',
      'hygiene/schema/schema-types.mts',
      'hygiene/schema/sources/sqlc-schemas.mts',
      'hygiene/schema/statements/alembic-statements.mts',
      'hygiene/schema/statements/changelog-statements.mts',
      'hygiene/schema/statements/comma-parts.mts',
      'hygiene/schema/statements/sql-statements.mts',
      'hygiene/tracked-files.mts',
      'jsonc/jsonc.mts',
      'lists/items.mjs',
      'lists/lists.mts',
      'messages/docs-url.mts',
      'messages/error-chain.mts',
      'messages/exception-sentence.mts',
      'messages/terminal/terminal-text.mts',
      'messages/troubleshooting.mts',
      'naming/secret-words.mts',
      'paths/glob.mts',
      'processes/deadlines.mts',
      'processes/environment.mts',
      'project-rules/hygiene-rules.mts',
      'project-rules/typed/rule-types.mts',
      'text-order/by-text.mts',
      'traversal.mts',
      'values/config-types.mts',
      'values/findings.mts',
      'values/parse-module.mts',
      'values/readers.mts',
    ]);
  });
});
