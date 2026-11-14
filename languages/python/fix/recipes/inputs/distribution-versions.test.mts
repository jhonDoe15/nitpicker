import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { useGitFixtures } from '../../test-support/git-fixtures.mts';
import { installedVersions } from '../typed/recipe-views.mts';

const { temporaryRoot } = useGitFixtures();
const hasPackaging =
  spawnSync('python3', ['-c', 'import packaging.specifiers'], { timeout: 10_000 }).status === 0;
const MANIFEST = (range: string) => `[project]\nname = "demo"\nrequires-python = "${range}"\n`;

function distribution(site: string, name: string, requires: string | undefined): void {
  const folder = path.join(site, `${name}-1.0.dist-info`);
  mkdirSync(folder, { recursive: true });
  const lines = ['Metadata-Version: 2.1', `Name: ${name}`, 'Version: 1.0'];
  if (requires !== undefined) {
    lines.push(`Requires-Python: ${requires}`);
  }
  writeFileSync(path.join(folder, 'METADATA'), `${lines.join('\n')}\n`);
}

function projectWith(manifest: string | undefined, distributions: [string, string | undefined][]) {
  const root = temporaryRoot('nitpicker-distributions-');
  const site = path.join(root, 'site');
  for (const [name, requires] of distributions) {
    distribution(site, name, requires);
  }
  if (manifest !== undefined) {
    writeFileSync(path.join(root, 'pyproject.toml'), manifest);
  }
  const bootstrap = [
    'import runpy, sys',
    `sys.path.insert(0, ${JSON.stringify(site)})`,
    'sys.argv = sys.argv[1:]',
    "runpy.run_path(sys.argv[0], run_name='__main__')",
  ].join('; ');
  return {
    projectRoot: root,
    reportRoot: root,
    launcher: {
      launch: (_tool: string, args: string[]) => ({
        command: 'python3',
        args: ['-I', '-c', bootstrap, ...args.slice(1)],
        env: {},
      }),
    },
  };
}

function versions(context: object, names: string[]) {
  const findings = names.map((name) => ({ identity: `unlisted:${name}` }));
  return installedVersions(context, findings);
}

describe.skipIf(!hasPackaging)('installed distribution versions', () => {
  const DISTRIBUTIONS: [string, string | undefined][] = [
    ['newer', '>=3.12'],
    ['older', '>=3.8'],
    ['plain', undefined],
  ];

  it('reports null for a distribution that needs a newer Python than the project minimum', () => {
    const context = projectWith(MANIFEST('>=3.10,<4'), DISTRIBUTIONS);

    expect(versions(context, ['newer', 'older', 'plain', 'absent'])).toEqual({
      newer: null,
      older: '1.0',
      plain: '1.0',
    });
  });

  it('reports every installed version when the project sets no minimum', () => {
    const context = projectWith(undefined, DISTRIBUTIONS);

    expect(versions(context, ['newer', 'plain'])).toEqual({ newer: '1.0', plain: '1.0' });
  });
});
