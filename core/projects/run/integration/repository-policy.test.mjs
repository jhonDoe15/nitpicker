import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { crashingAnalyzer, fakeAnalyzer } from '../../../command/test-support/cli-harness.mjs';
import { writeFiles } from '../../../diff/git/test-support/fixture-files.mjs';
import { fixtureGit } from '../../../diff/git/test-support/git-repository.mjs';
import { projectFiles, useMonorepoFixtures, violation } from '../test-support/monorepo-harness.mjs';

const { repository, run } = useMonorepoFixtures();

const REMOVED =
  'project api is no longer one of the projects of the monorepo, so nothing gates it with its own config';
const SPLIT =
  'the repository is no longer split into projects: web, api were gated as projects of their own ' +
  'and are now part of one project';

function typescriptProject(folder) {
  return projectFiles(folder, {
    'package.json': JSON.stringify({ name: folder, version: '1.0.0' }),
    'src/a.ts': 'export {};\n',
  });
}

function listed(projects) {
  return repository({
    'nitpicker.config.json': JSON.stringify({ projects }),
    ...typescriptProject('web'),
    ...typescriptProject('api'),
  });
}

describe('the set of projects', () => {
  it('reports a project taken out of "projects" as a loosening of the repository policy', () => {
    const root = listed(['web', 'api']);
    writeFiles(root, { 'nitpicker.config.json': JSON.stringify({ projects: ['web'] }) });

    const result = run(root);
    const { repositoryPolicy } = result.json('summary.json');
    const accepted = run(root, [], {
      environment: { CI: 'true', NITPICKER_ACCEPT_POLICY_CHANGE: repositoryPolicy.policyDigest },
    });

    expect(result.exitCode).toBe(1);
    expect(repositoryPolicy).toEqual({
      policyLoosenings: [REMOVED],
      policyDigest: expect.stringMatching(/^[0-9a-f]{12}$/u),
      accepted: false,
      newEnforceableFindings: 1,
    });
    expect(result.summary.split('\n').slice(2, 4)).toEqual([
      `  ✖ repository policy (not accepted, digest ${repositoryPolicy.policyDigest}): ${REMOVED}`,
      'Policy loosenings in the repository policy. A person who accepts them all sets ' +
        `NITPICKER_ACCEPT_POLICY_CHANGE=${repositoryPolicy.policyDigest} in CI.`,
    ]);
    expect(accepted.exitCode).toBe(0);
    expect(
      result
        .json('report.sarif')
        .runs.map((entry) => [
          entry.automationDetails.id,
          entry.results.map(
            (finding) => finding.locations[0].physicalLocation.artifactLocation.uri,
          ),
        ]),
    ).toEqual([
      ['nitpicker/web/', []],
      ['nitpicker-repository/', ['nitpicker.config.json']],
    ]);
  });

  it('reports an emptied list as a loosening when the repository is gated as one project', () => {
    const root = listed(['web', 'api']);
    writeFiles(root, { 'nitpicker.config.json': JSON.stringify({ projects: [] }) });

    const result = run(root);

    expect(result.exitCode).toBe(1);
    expect(result.json('summary.json').policyLoosenings).toEqual([SPLIT]);
  });

  it('reports the end of the split in a run that takes its base from the config', () => {
    const root = repository({
      'nitpicker.config.json': JSON.stringify({
        base: 'comparison-base',
        projects: ['web', 'api'],
      }),
      ...typescriptProject('web'),
      ...typescriptProject('api'),
    });
    writeFiles(root, { 'nitpicker.config.json': JSON.stringify({ base: 'comparison-base' }) });

    const result = run(root, [], { withoutBase: true });

    expect([result.exitCode, result.json('summary.json').policyLoosenings]).toEqual([1, [SPLIT]]);
  });

  it('fails closed when the projects of the base cannot be read', () => {
    const root = repository({
      'nitpicker.config.json': JSON.stringify({ projects: ['web', 'gone'] }),
      ...projectFiles('.'),
      ...typescriptProject('web'),
    });
    writeFiles(root, { 'nitpicker.config.json': '{}' });

    const result = run(root);

    expect(result.exitCode).toBe(2);
    expect(result.json('tool-errors.json').map(({ tool, snapshot }) => [tool, snapshot])).toEqual([
      ['nitpicker-projects', 'base'],
    ]);
  });

  it('fails closed in a monorepo run when the projects of the base cannot be read', () => {
    const root = repository({
      'nitpicker.config.json': JSON.stringify({ projects: ['web', 'gone'] }),
      ...typescriptProject('web'),
    });
    writeFiles(root, { 'nitpicker.config.json': JSON.stringify({ projects: ['web'] }) });

    const result = run(root);
    const { overallStatus, repositoryPolicy } = result.json('summary.json');

    expect([result.exitCode, overallStatus]).toEqual([2, 'tool-error']);
    expect(repositoryPolicy.toolErrors.map(({ tool }) => tool)).toEqual(['nitpicker-projects']);
    expect(result.summary.split('\n')[2]).toBe(
      '  ! repository policy, the run is incomplete: the projects of the base could not be read, ' +
        'so a change to them is not checked: nitpicker.config.json: "projects" lists gone, ' +
        `which is not a folder under ${root}`,
    );
  });

  it('reports a project moved out of the folders "projects" matches', () => {
    const root = repository({
      'nitpicker.config.json': JSON.stringify({ projects: ['packages/*'] }),
      ...typescriptProject('packages/a'),
      ...typescriptProject('packages/b'),
    });
    mkdirSync(path.join(root, 'legacy'));
    fixtureGit(root, ['mv', 'packages/b', 'legacy/b']);

    const result = run(root);
    const summary = result.json('summary.json');
    const junit = readFileSync(path.join(result.reports, 'report.junit.xml'), 'utf8');

    expect([result.exitCode, summary.repositoryPolicy.policyLoosenings]).toEqual([
      1,
      [
        'project packages/b is no longer one of the projects of the monorepo, ' +
          'so nothing gates it with its own config',
      ],
    ]);
    expect(summary.projects.map(({ status }) => status)).toEqual(['skipped']);
    expect(junit.match(/<testsuite name="[^"]*"/gu)).toEqual([
      '<testsuite name="quality.diff (repository policy)"',
    ]);
  });

  it('keeps the repository policy apart from a project named repository', () => {
    const root = repository({
      'nitpicker.config.json': JSON.stringify({ projects: ['repository', 'api'] }),
      ...typescriptProject('repository'),
      ...typescriptProject('api'),
    });
    writeFiles(root, { 'nitpicker.config.json': JSON.stringify({ projects: ['repository'] }) });

    const result = run(root);

    expect(result.json('report.sarif').runs.map((entry) => entry.automationDetails.id)).toEqual([
      'nitpicker/repository/',
      'nitpicker-repository/',
    ]);
  });

  it('compares a preset changed in "projects" with the preset of the base', () => {
    const root = listed([{ path: 'web', preset: 'typescript' }, 'api']);
    writeFiles(root, {
      'nitpicker.config.json': JSON.stringify({
        projects: [{ path: 'web', preset: 'javascript' }, 'api'],
      }),
    });

    const result = run(root);

    expect(result.exitCode).toBe(1);
    expect(result.json('web/summary.json').policyLoosenings).toEqual([
      'preset: "typescript" -> "javascript" (from ../nitpicker.config.json)',
    ]);
    expect(result.plan.split('\n').slice(1)).toEqual([
      '  run  web (javascript): root config nitpicker.config.json changed',
      '  run  api (typescript): root config nitpicker.config.json changed',
    ]);
  });

  it('warns about a new project folder that "projects" does not list', () => {
    const root = listed(['web', 'api']);
    writeFiles(root, { 'tools/x/pyproject.toml': '[project]\nname = "x"\n' });

    const result = run(root);

    expect(result.err).toBe(
      'nitpicker: tools/x now holds a project file but is not in "projects" of ' +
        'nitpicker.config.json, so no project gates it. Add it to "projects" to gate it.\n',
    );
    expect(result.json('summary.json').notices).toEqual([result.err.slice(11, -1)]);
  });

  it('removes the reports of a project that is no longer listed', () => {
    const root = listed(['web', 'api']);
    writeFiles(root, { 'api/src/a.ts': violation('a') });
    const first = run(root);
    writeFiles(root, { 'nitpicker.config.json': JSON.stringify({ projects: ['web'] }) });

    run(root, ['--output', first.reports]);

    expect(existsSync(path.join(first.reports, 'api'))).toBe(false);
  });
});

describe('a run that does not complete', () => {
  const analyzers = [fakeAnalyzer(), crashingAnalyzer()];

  it('says so for a project with violations and tool errors, also when exits are deferred', () => {
    const root = listed(['web', 'api']);
    writeFiles(root, { 'web/src/a.ts': violation('w') });

    const result = run(root, [], { analyzers });
    const deferred = run(root, ['--defer-exit'], { analyzers });

    expect(result.exitCode).toBe(1);
    expect(result.summary.split('\n')[1]).toBe(
      '  ✖ web (typescript): 1 new enforceable violation, and tool errors: the run is incomplete',
    );
    const summary = result.json('summary.json');
    expect([
      summary.overallStatus,
      summary.counts.incomplete,
      summary.projects[0].overallStatus,
    ]).toEqual(['tool-error', 1, 'tool-error']);
    expect(deferred.exitCode).toBe(2);
  });
});

describe('the combined machine reports', () => {
  it('hold every project with its paths from the repository root', () => {
    const root = listed(['web', 'api']);
    writeFiles(root, { 'web/src/a.ts': violation('w'), 'api/src/a.ts': violation('a') });

    const result = run(root);
    const sarif = result.json('report.sarif');
    const junit = readFileSync(path.join(result.reports, 'report.junit.xml'), 'utf8');

    expect(
      sarif.runs.map((entry) => [
        entry.automationDetails.id,
        entry.results.map((finding) => finding.locations[0].physicalLocation.artifactLocation.uri),
      ]),
    ).toEqual([
      ['nitpicker/web/', ['web/src/a.ts']],
      ['nitpicker/api/', ['api/src/a.ts']],
    ]);
    expect(result.json('report-baseline.sarif').runs).toHaveLength(2);
    expect(junit.match(/<testsuite name="[^"]*"/gu)).toEqual([
      '<testsuite name="quality.diff web"',
      '<testsuite name="quality.diff api"',
    ]);
    expect(junit.match(/name="fake-quality-analyzer\/fixture-rule [^"]*"/gu)).toEqual([
      'name="fake-quality-analyzer/fixture-rule web/src/a.ts:1"',
      'name="fake-quality-analyzer/fixture-rule api/src/a.ts:1"',
    ]);
  });
});

function pythonMember(name) {
  return projectFiles(`libs/${name}`, {
    'pyproject.toml': `[project]\nname = "${name}"\n`,
    'src/m.py': 'M = 1\n',
  });
}

function uvWorkspace() {
  return repository({
    'pyproject.toml': '[tool.uv.workspace]\nmembers = ["libs/*"]\n',
    ...pythonMember('a'),
    ...pythonMember('b'),
  });
}

describe('a run inside a member of a workspace', () => {
  it('checks only that member', () => {
    const root = uvWorkspace();
    writeFiles(root, { 'libs/a/src/m.py': 'M = 2\n', 'libs/b/src/m.py': 'M = 2\n' });

    const result = run(root, [], { workingDirectory: path.join(root, 'libs/a/src') });

    expect([result.exitCode, result.plan, result.headings]).toEqual([0, '', []]);
    expect(result.json('summary.json').configOverrides).toEqual(['preset: "python"']);
  });

  it('reports a shrunk workspace as a loosening of the member it runs', () => {
    const root = uvWorkspace();
    writeFiles(root, { 'pyproject.toml': '[tool.uv.workspace]\nmembers = ["libs/a"]\n' });
    const inside = { workingDirectory: path.join(root, 'libs/a') };

    const result = run(root, [], inside);
    const { policyLoosenings, policyDigest } = result.json('summary.json');
    const accepted = run(root, [], {
      ...inside,
      environment: { CI: 'true', NITPICKER_ACCEPT_POLICY_CHANGE: policyDigest },
    });

    expect([result.exitCode, policyLoosenings]).toEqual([
      1,
      [
        'project libs/b is no longer one of the projects of the monorepo, ' +
          'so nothing gates it with its own config',
      ],
    ]);
    expect(accepted.exitCode).toBe(0);
  });

  it('reports a shrunk workspace in a member that has its own package.json', () => {
    const root = repository({
      'package.json': JSON.stringify({ private: true, workspaces: ['packages/*'] }),
      ...typescriptProject('packages/a'),
      ...typescriptProject('packages/b'),
    });
    writeFiles(root, {
      'package.json': JSON.stringify({ private: true, workspaces: ['packages/a'] }),
    });

    const result = run(root, [], { workingDirectory: path.join(root, 'packages/a/src') });

    expect([result.exitCode, result.json('summary.json').policyLoosenings]).toEqual([
      1,
      [
        'project packages/b is no longer one of the projects of the monorepo, ' +
          'so nothing gates it with its own config',
      ],
    ]);
  });

  it('gives cache and aggregate the preset the workspace gives the member', () => {
    const root = uvWorkspace();
    const inside = { workingDirectory: path.join(root, 'libs/a/src') };

    const cache = run(root, [], { ...inside, command: ['cache', 'publish'] });
    const aggregate = run(root, [], {
      ...inside,
      command: ['aggregate', '--input-root', 'shards', '--shard-count', '2'],
    });

    expect([cache.exitCode, cache.err]).toEqual([
      2,
      'nitpicker failed: nitpicker cache publish requires NITPICKER_CACHE_URL\n',
    ]);
    expect([aggregate.exitCode, aggregate.err]).toEqual([
      2,
      'Quality shard aggregation failed: shardCount 2 exceeds 1 independent analyzer components\n',
    ]);
  });
});

describe('projects inside another project', () => {
  it('are left out of the run of the project that holds them', () => {
    const root = repository({
      'nitpicker.config.json': JSON.stringify({ projects: ['.', 'web'] }),
      'package.json': '{"name":"root","version":"1.0.0"}',
      'src/r.ts': 'export {};\n',
      ...projectFiles('.'),
      ...typescriptProject('web'),
    });
    writeFiles(root, { 'src/r.ts': 'export const r = 1;\n', 'web/src/a.ts': violation('w') });

    const result = run(root);

    expect(result.json('_root/summary.json').configOverrides).toEqual(['exclude: ["web/**"]']);
    expect(result.json('web/summary.json').configOverrides).toEqual([]);
  });
});

describe('a repository without a workspace', () => {
  it('stays one project and names the folders that look like projects of their own', () => {
    const root = repository({
      ...typescriptProject('.'),
      'android/build.gradle': '',
      'examples/demo/pyproject.toml': '[project]\nname = "demo"\n',
    });

    const result = run(root);

    expect([result.exitCode, result.plan, result.headings]).toEqual([0, '', []]);
    expect(result.err).toBe(
      'nitpicker: android (Gradle build), examples/demo (Python project) look like projects of ' +
        'their own, and this run does not gate them with their own preset. To gate each in one run, ' +
        'list them in "projects" of nitpicker.config.json, for example ' +
        '"projects": [".", "android", "examples/demo"].\n',
    );
  });
});

describe('--analyzer', () => {
  it('names an analyzer that no project has', () => {
    const result = run(listed(['web', 'api']), ['--analyzer', 'nope']);

    expect([result.exitCode, result.err]).toEqual([
      2,
      'nitpicker failed: Unknown --analyzer: nope. Known analyzers of the projects in this ' +
        'monorepo: fake-quality-analyzer\n',
    ]);
  });
});
