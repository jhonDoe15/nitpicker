import { describe, expect, it } from 'vitest';
import { writeFiles } from '../../../diff/git/test-support/fixture-files.mts';
import { planMonorepo } from '../../plan/inspect.mts';
import { projectFiles, useMonorepoFixtures, violation } from '../test-support/monorepo-harness.mts';

const { repository, run } = useMonorepoFixtures();

function workspaceFiles(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'package.json': JSON.stringify({
      name: 'workspace',
      private: true,
      workspaces: ['packages/*'],
    }),
    ...projectFiles('packages/standard', {
      'package.json': JSON.stringify({ name: 'standard' }),
      'src/index.ts': 'export const standard = 1;\n',
    }),
    ...projectFiles('packages/app', {
      'package.json': JSON.stringify({ name: 'app', main: './index.tsx' }),
      'index.tsx': 'export const app = 1;\n',
      'components/Button.tsx': 'export const Button = () => null;\n',
    }),
    ...extra,
  };
}

describe('workspace package with code at the package root', () => {
  it('plans a derived layout for the root-level package and leaves the src/ package unchanged', () => {
    const root = repository(workspaceFiles());
    const plan = planMonorepo({ root });
    const standard = plan?.projects.find(({ path }) => path === 'packages/standard');
    const app = plan?.projects.find(({ path }) => path === 'packages/app');

    expect(standard?.derivedSourceRoots).toBeUndefined();
    expect(app?.derivedSourceRoots).toEqual(['.']);
    expect(app?.overlay?.settings).toEqual({ layout: { sourceRoots: ['.'] } });
  });

  it('analyzes both the src/ package and the root-level package and prints one derived-layout notice', () => {
    const root = repository(workspaceFiles());
    writeFiles(root, {
      'packages/standard/src/index.ts': violation('standard-finding'),
      'packages/app/components/Button.tsx': violation('root-level-finding'),
    });

    const result = run(root);

    expect(result.exitCode).toBe(1);
    expect(result.json('packages/standard/new-findings.json')).toHaveLength(1);
    expect(result.json('packages/app/new-findings.json')).toHaveLength(1);
    expect(result.err).toContain(
      'nitpicker: packages/app has no src/ folder, so this run derived "layout.sourceRoots": ["."].',
    );
    expect(result.json('summary.json').notices).toEqual([
      'packages/app has no src/ folder, so this run derived "layout.sourceRoots": ["."]. ' +
        'Pin "layout.sourceRoots" in its nitpicker.config.json to keep it explicit.',
    ]);
  });

  it('respects an explicit layout.sourceRoots in nitpicker.config.json without emitting a notice', () => {
    const root = repository(
      workspaceFiles({
        'packages/app/nitpicker.config.json': JSON.stringify({
          layout: { sourceRoots: ['components'] },
        }),
      }),
    );
    const plan = planMonorepo({ root });
    const app = plan?.projects.find(({ path }) => path === 'packages/app');

    expect(app?.derivedSourceRoots).toBeUndefined();
    writeFiles(root, { 'packages/app/components/Button.tsx': violation('explicit-finding') });
    const result = run(root);

    expect(result.exitCode).toBe(1);
    expect(result.json('packages/app/new-findings.json')).toHaveLength(1);
    expect(result.json('summary.json').notices).toEqual([]);
  });
});
