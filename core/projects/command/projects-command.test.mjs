import { describe, expect, it } from 'vitest';
import { writeFiles } from '../../diff/git/test-support/fixture-files.mjs';
import {
  projectFiles,
  useMonorepoFixtures,
  violation,
} from '../run/test-support/monorepo-harness.mjs';

const { repository, run } = useMonorepoFixtures();
const BASE = ['--base', 'comparison-base'];
const WORKSPACE_PROJECT = { preset: 'typescript', origin: 'package.json workspaces' };

function monorepo() {
  return repository({
    'package.json': JSON.stringify({ name: 'top', workspaces: ['packages/*'] }),
    ...projectFiles('packages/ui', {
      'package.json': JSON.stringify({ name: '@acme/ui', version: '1.0.0' }),
      'src/a.ts': 'export const a = 1;\n',
    }),
    ...projectFiles('packages/web', {
      'package.json': JSON.stringify({ name: 'web', dependencies: { '@acme/ui': '1.0.0' } }),
      'src/b.ts': 'export const b = 1;\n',
    }),
    ...projectFiles('packages/docs', {
      'package.json': JSON.stringify({ name: 'docs', version: '1.0.0' }),
      'src/c.ts': 'export const c = 1;\n',
    }),
  });
}

async function listed(root, extra = []) {
  const result = await run(root, [], { command: ['projects', ...BASE, ...extra] });
  return { ...result, listing: extra.includes('--json') ? JSON.parse(result.out) : undefined };
}

describe('nitpicker projects', () => {
  it('lists every project and the ones the change selects, with the reasons', async () => {
    const root = monorepo();
    writeFiles(root, { 'packages/ui/src/a.ts': 'export const a = 2;\n' });

    const result = await listed(root);

    expect(result.exitCode).toBe(0);
    expect(result.out).toBe(
      '3 projects detected, 2 selected by the change against comparison-base:\n' +
        '  skip packages/docs (typescript; package.json workspaces): no changed files\n' +
        '  run  packages/ui (typescript; package.json workspaces): 1 changed file\n' +
        '  run  packages/web (typescript; package.json workspaces): depends on packages/ui\n',
    );
  });

  it('prints a job matrix and the details as JSON, matching what a run selects', async () => {
    const root = monorepo();
    writeFiles(root, { 'packages/ui/src/a.ts': violation('ui-finding') });

    const { listing } = await listed(root, ['--json']);
    const ran = (await run(root)).json('summary.json');

    expect(listing.matrix).toEqual({
      include: [
        { project: 'packages/ui', preset: 'typescript' },
        { project: 'packages/web', preset: 'typescript' },
      ],
    });
    expect(listing.projects.map(({ path, selected, reason }) => [path, selected, reason])).toEqual(
      ran.projects.map(({ path, status, reason }) => [path, status !== 'skipped', reason]),
    );
  });

  it('selects every project with --all and the named ones with --project', async () => {
    const root = monorepo();

    const all = await listed(root, ['--all', '--json']);
    const named = await listed(root, ['--project', 'packages/docs', '--json']);

    expect(all.listing.matrix.include).toHaveLength(3);
    expect(named.listing).toEqual({
      source: 'detected',
      selectedBy: '--project',
      matrix: { include: [{ project: 'packages/docs', preset: 'typescript' }] },
      projects: [
        {
          ...WORKSPACE_PROJECT,
          path: 'packages/docs',
          selected: true,
          reason: 'requested with --project',
        },
        { ...WORKSPACE_PROJECT, path: 'packages/ui', selected: false, reason: 'not requested' },
        { ...WORKSPACE_PROJECT, path: 'packages/web', selected: false, reason: 'not requested' },
      ],
      outsideProjects: [],
    });
  });

  it('lists the one project of a repository that is not a monorepo', async () => {
    const root = repository({
      ...projectFiles('.', {
        'package.json': '{"name":"one"}',
        'src/a.ts': 'export const a = 1;\n',
      }),
    });

    expect((await listed(root, ['--json'])).listing).toEqual({
      source: 'single',
      selectedBy: 'a run in a repository of one project',
      matrix: { include: [{ project: '.', preset: 'typescript' }] },
      projects: [
        {
          path: '.',
          preset: 'typescript',
          origin: 'one project',
          selected: true,
          reason: 'the only project',
        },
      ],
      outsideProjects: [],
    });
  });

  it('refuses an unknown option and names the usage', async () => {
    const result = await listed(monorepo(), ['--details']);

    expect(result.exitCode).toBe(2);
    expect(result.err).toBe(
      'nitpicker failed: Unknown argument: --details. ' +
        'Usage: nitpicker projects [--base <ref>] [--all] [--project <path>]... [--json] [--help]\n',
    );
  });
});
