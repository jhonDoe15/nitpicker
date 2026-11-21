import { describe, expect, it } from 'vitest';
import { writeFiles } from '../../../diff/git/test-support/fixture-files.mts';
import {
  projectFiles,
  useMonorepoFixtures,
  violation,
  type MonorepoRun,
} from '../test-support/monorepo-harness.mts';
import { statusList } from '../test-support/status-list.mts';

const { repository, run } = useMonorepoFixtures();

const SHARED = JSON.stringify({ thresholds: { fileLines: 200, crapLimit: 8 } });

function sharedMonorepo(shared = SHARED) {
  return repository({
    'shared/base.json': shared,
    'nitpicker.config.json': JSON.stringify({ projects: ['web', 'api', 'tools'] }),
    ...projectFiles('web', {
      'package.json': '{"name":"web"}\n',
      'nitpicker.config.json': '{"extends":"../shared/base.json"}',
      'src/a.ts': 'export const a = 1;\n',
    }),
    ...projectFiles('api', {
      'package.json': '{"name":"api"}\n',
      'nitpicker.config.json': '{"extends":"../shared/base.json","thresholds":{"fileLines":150}}',
      'src/a.ts': 'export const a = 1;\n',
    }),
    ...projectFiles('tools', {
      'package.json': '{"name":"tools"}\n',
      'src/a.ts': 'export const a = 1;\n',
    }),
  });
}

function reportOf(result: MonorepoRun, project: string) {
  return {
    summary: result.json(`${project}/summary.json`),
    findings: result.json(`${project}/new-findings.json`),
  };
}

describe('projects that extend a shared config', () => {
  it('run with the merged config, and the cache key shows it', () => {
    const root = sharedMonorepo();
    writeFiles(root, { 'web/src/a.ts': violation('w'), 'api/src/a.ts': violation('a') });

    const result = run(root);

    expect(reportOf(result, 'web').summary.configOverrides).toEqual([
      'thresholds: {"fileLines":200,"crapLimit":8}',
    ]);
    expect(reportOf(result, 'api').summary.configOverrides).toEqual([
      'thresholds: {"fileLines":150,"crapLimit":8}',
    ]);
  });

  it('are all run, with the reason named, when only the shared file changed', () => {
    const root = sharedMonorepo();
    writeFiles(root, {
      'shared/base.json': JSON.stringify({ thresholds: { fileLines: 100, crapLimit: 8 } }),
    });

    const result = run(root);

    expect(result.exitCode).toBe(0);
    expect(result.plan.split('\n').slice(1)).toEqual([
      '  run  web (typescript): shared config shared/base.json changed',
      '  run  api (typescript): shared config shared/base.json changed',
      '  skip 1 project: no changed files (--details lists them)',
    ]);
  });

  it('name the shared file when it is not valid, and fail every project that uses it', () => {
    const root = sharedMonorepo();
    writeFiles(root, { 'shared/base.json': '{"colour":"red"}' });

    const result = run(root);

    expect(result.exitCode).toBe(2);
    expect(statusList(result)).toEqual(['error', 'error', 'skipped']);
    expect((result.err.split('\n')[0] ?? '').split('. Allowed keys:')[0]).toBe(
      'nitpicker failed in web: shared/base.json: unknown key "colour"',
    );
  });

  it('fail a project whose config extends null', () => {
    const root = sharedMonorepo();
    writeFiles(root, { 'tools/nitpicker.config.json': '{"extends":null}' });

    const result = run(root);

    expect([result.exitCode, result.err]).toEqual([
      2,
      'nitpicker failed in tools: nitpicker.config.json: "extends" must be the path of a JSON ' +
        'config file, such as "../base.json"\n',
    ]);
  });
});

function workspaceWithRootConfig(rootConfig: object): string {
  return repository({
    'nitpicker.config.json': JSON.stringify(rootConfig),
    'package.json': '{"private":true,"workspaces":["packages/*"]}\n',
    ...projectFiles('packages/a', {
      'package.json': '{"name":"a"}\n',
      'src/a.ts': 'export const a = 1;\n',
    }),
  });
}

describe('the root config of a workspace', () => {
  it('still applies to each member, with its paths taken from the member', () => {
    const root = workspaceWithRootConfig({ exclude: ['packages/a/src/**'] });
    writeFiles(root, { 'packages/a/src/a.ts': violation('a') });

    const result = run(root);

    expect(reportOf(result, 'packages/a').summary.configOverrides).toEqual(['exclude: ["src/**"]']);
  });

  it('still applies when the root holds files of another language', () => {
    const root = workspaceWithRootConfig({ exclude: ['packages/a/src/gen/**'] });
    writeFiles(root, { 'requirements.txt': 'mkdocs\n', 'packages/a/src/a.ts': violation('a') });

    const result = run(root);

    expect(reportOf(result, 'packages/a').summary.configOverrides).toEqual([
      'exclude: ["src/gen/**"]',
    ]);
  });
});
