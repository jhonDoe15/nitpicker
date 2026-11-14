import { describe, expect, it } from 'vitest';
import { projectFiles, useMonorepoFixtures } from '../test-support/monorepo-harness.mjs';

const { repository, run } = useMonorepoFixtures();
const PACKAGES = ['p1', 'p2', 'p3', 'p5', 'p10'];

function workspace(extra = {}) {
  return repository({
    'package.json': JSON.stringify({ name: 'top', workspaces: ['packages/*', 'apps/*'] }),
    ...Object.assign(
      {},
      ...PACKAGES.map((name) =>
        projectFiles(`packages/${name}`, {
          'package.json': JSON.stringify({ name: `@acme/${name}`, version: '1.0.0' }),
          'src/index.ts': `export const ${name} = 1;\n`,
        }),
      ),
    ),
    ...extra,
  });
}

function ran(result) {
  return result
    .json('summary.json')
    .projects.filter(({ status }) => status !== 'skipped')
    .map(({ path }) => path);
}

describe('--project in a monorepo', () => {
  it('takes a package name', () => {
    const result = run(workspace(), ['--project', '@acme/p5']);

    expect(result.exitCode).toBe(0);
    expect(ran(result)).toEqual(['packages/p5']);
  });

  it('takes a quoted glob over folders and names', () => {
    const root = workspace();

    expect(ran(run(root, ['--project', 'packages/p1*']))).toEqual(['packages/p1', 'packages/p10']);
    expect(ran(run(root, ['--project', '@acme/p{2,3}']))).toEqual(['packages/p2', 'packages/p3']);
  });

  it('reads a folder from the current folder', () => {
    const root = workspace();

    const result = run(root, ['--project', 'p5'], { workingDirectory: `${root}/packages` });

    expect(ran(result)).toEqual(['packages/p5']);
  });

  it('selects from the whole monorepo inside a member', () => {
    const root = workspace();

    const result = run(root, ['--project', 'packages/p5'], {
      workingDirectory: `${root}/packages/p3/src`,
    });

    expect(result.exitCode).toBe(0);
    expect(ran(result)).toEqual(['packages/p5']);
  });

  it('names the closest projects when nothing matches', () => {
    const result = run(workspace(), ['--project', 'packages/p4']);

    expect(result.exitCode).toBe(2);
    expect(result.err).toBe(
      'nitpicker failed: --project packages/p4 matches no project of this repository by folder, ' +
        'folder from the current one, or package name. Closest: packages/p1, packages/p2, ' +
        'packages/p3, packages/p5, packages/p10. nitpicker projects lists them all.\n',
    );
  });

  it('refuses a name and a folder that point at different projects', () => {
    const root = workspace(
      projectFiles('apps/p2', {
        'package.json': JSON.stringify({ name: 'packages/p2', version: '1.0.0' }),
        'src/index.ts': 'export const app = 1;\n',
      }),
    );

    const result = run(root, ['--project', 'packages/p2']);

    expect(result.exitCode).toBe(2);
    expect(result.err).toBe(
      'nitpicker failed: --project packages/p2 names more than one project: packages/p2 (path) ' +
        'and apps/p2 (name). Give the project folder from the top of the monorepo instead.\n',
    );
  });

  it('says to quote a glob the shell expanded into paths', () => {
    const root = workspace();

    const result = run(root, ['--project', 'packages/p1', 'packages/p10'], {
      workingDirectory: root,
    });

    expect(result.exitCode).toBe(2);
    expect(result.err).toContain("quote it: --project 'packages/*'");
  });
});
