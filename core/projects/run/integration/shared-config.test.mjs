import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { writeFiles } from '../../../diff/git/test-support/fixture-files.mjs';
import { projectFiles, useMonorepoFixtures, violation } from '../test-support/monorepo-harness.mjs';

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

function reportOf(result, project) {
  return {
    summary: result.json(`${project}/summary.json`),
    findings: result.json(`${project}/new-findings.json`),
  };
}

function loosenings(result, project) {
  return reportOf(result, project).findings.filter(({ rule }) => rule === 'policy-loosened');
}

const EXCEPTIONS = {
  thresholds: { fileLines: 200 },
  exceptions: [{ rule: 'file-lines-limit', paths: ['src/**'], reason: 'tables' }],
};

function exceptionsMonorepo() {
  const root = sharedMonorepo(JSON.stringify({ thresholds: { fileLines: 200 } }));
  writeFiles(root, { 'shared/base.json': JSON.stringify(EXCEPTIONS) });
  return root;
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
      '  skip tools (typescript): no changed files',
    ]);
  });

  it('report a loosening made in the shared file for every project that uses it', () => {
    const root = sharedMonorepo();
    writeFiles(root, {
      'shared/base.json': JSON.stringify({ thresholds: { fileLines: 400, crapLimit: 8 } }),
    });

    const result = run(root);

    expect(result.exitCode).toBe(1);
    expect(loosenings(result, 'web')).toHaveLength(1);
    expect(loosenings(result, 'web')[0].identity).toBe(
      'threshold fileLines raised from 200 to 400 (from shared/base.json)',
    );
    expect(loosenings(result, 'api')).toHaveLength(0);
    expect(reportOf(result, 'api').summary.policyChanges).toEqual([]);
    expect(result.json('summary.json').projects.map(({ status }) => status)).toEqual([
      'failed',
      'passed',
      'skipped',
    ]);
  });

  it('report a loosening for each project it reaches, each with a digest that covers the shared file', () => {
    const result = run(exceptionsMonorepo());

    const [web, api] = ['web', 'api'].map((project) => reportOf(result, project).summary);
    expect(web.policyLoosenings).toEqual(api.policyLoosenings);
    expect(web.policyLoosenings.length).toBeGreaterThan(0);
    expect(web.policyDigest).toMatch(/^[0-9a-f]{12}$/u);
    expect(api.policyDigest).toMatch(/^[0-9a-f]{12}$/u);
    expect(result.exitCode).toBe(1);
    expect(result.summary.split('\n').slice(-3)).toEqual([
      'Policy loosenings in 2 projects. A person who accepts them all sets ' +
        `NITPICKER_ACCEPT_POLICY_CHANGE=${web.policyDigest},${api.policyDigest} in CI.`,
      'Combined report: <reports>/summary.json',
      '',
    ]);
  });

  it('let a person accept each project by its digest in a list joined by commas', () => {
    const root = exceptionsMonorepo();
    const first = run(root);
    const digests = ['web', 'api'].map((project) => reportOf(first, project).summary.policyDigest);

    const partly = run(root, [], {
      environment: { CI: 'true', NITPICKER_ACCEPT_POLICY_CHANGE: `000000000000,${digests[0]}` },
    });

    expect(partly.exitCode).toBe(1);
    expect(loosenings(partly, 'web')).toHaveLength(0);
    expect(loosenings(partly, 'api')).toHaveLength(1);
  });

  it('change the digest when the shared file changes in another way', () => {
    const first = sharedMonorepo();
    writeFiles(first, {
      'shared/base.json': JSON.stringify({ thresholds: { fileLines: 400, crapLimit: 8 } }),
    });
    const second = sharedMonorepo();
    writeFiles(second, {
      'shared/base.json': JSON.stringify({
        thresholds: { fileLines: 400, crapLimit: 8 },
        exclude: ['gen/**'],
      }),
    });

    const digests = [first, second].map((root) => reportOf(run(root), 'web').summary.policyDigest);

    expect(digests[0]).toMatch(/^[0-9a-f]{12}$/u);
    expect(digests[1]).toMatch(/^[0-9a-f]{12}$/u);
    expect(digests[0]).not.toBe(digests[1]);
  });

  it('let a person accept the loosening once for every project', () => {
    const root = sharedMonorepo();
    writeFiles(root, {
      'shared/base.json': JSON.stringify({ thresholds: { fileLines: 400, crapLimit: 8 } }),
    });
    const digest = reportOf(run(root), 'web').summary.policyDigest;

    const accepted = run(root, [], {
      environment: { CI: 'true', NITPICKER_ACCEPT_POLICY_CHANGE: digest },
    });

    expect(accepted.exitCode).toBe(0);
    expect(loosenings(accepted, 'web')).toHaveLength(0);
  });

  it('name the shared file when it is not valid, and fail every project that uses it', () => {
    const root = sharedMonorepo();
    writeFiles(root, { 'shared/base.json': '{"colour":"red"}' });

    const result = run(root);

    expect(result.exitCode).toBe(2);
    expect(result.json('summary.json').projects.map(({ status }) => status)).toEqual([
      'error',
      'error',
      'skipped',
    ]);
    expect(result.err.split('\n')[0].split('. Allowed keys:')[0]).toBe(
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

function workspaceWithRootConfig(rootConfig) {
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

  it('is policy of every member: loosening it is reported with the root config named', () => {
    const root = workspaceWithRootConfig({ thresholds: { fileLines: 200 } });
    writeFiles(root, {
      'nitpicker.config.json': JSON.stringify({ thresholds: { fileLines: 400 } }),
    });

    const result = run(root);

    expect(result.exitCode).toBe(1);
    expect(loosenings(result, 'packages/a').map(({ identity }) => identity)).toEqual([
      'threshold fileLines raised from 200 to 400 (from ../../nitpicker.config.json)',
    ]);
  });

  it('is policy of a run started in a member folder that has its own package.json', () => {
    const root = workspaceWithRootConfig({ thresholds: { fileLines: 200 } });
    writeFiles(root, {
      'nitpicker.config.json': JSON.stringify({ thresholds: { fileLines: 900 } }),
      'packages/a/src/a.ts': 'export const a = 2;\n',
    });

    const inside = run(root, [], { workingDirectory: path.join(root, 'packages/a') });

    expect(inside.exitCode).toBe(1);
    expect(
      inside
        .json('new-findings.json')
        .filter(({ rule }) => rule === 'policy-loosened')
        .map(({ identity }) => identity),
    ).toEqual(['threshold fileLines raised from 200 to 900 (from ../../nitpicker.config.json)']);
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
