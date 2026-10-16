import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveLayoutFor } from '../../layout.mjs';
import { loadPackages } from './packages.mjs';

const layout = resolveLayoutFor({});
let directory;

function write(files) {
  directory = mkdtempSync(path.join(tmpdir(), 'nitpicker-packages-'));
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(directory, name)), { recursive: true });
    writeFileSync(path.join(directory, name), text);
  }
  return directory;
}

function names(project) {
  return loadPackages(project, layout)
    .packages.map(({ name }) => name)
    .toSorted();
}

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

describe('workspace discovery', () => {
  it('reads npm workspaces in the object form, skipping manifests without a name', () => {
    const project = write({
      'package.json': '{"name":"root","workspaces":{"packages":["libs/**"]}}',
      'libs/a/package.json': '{"name":"a"}',
      'libs/group/b/package.json': '{"name":"b","private":true}',
      'libs/marker/package.json': '{"type":"module"}',
      'libs/node_modules/c/package.json': '{"name":"c"}',
    });

    expect(names(project)).toEqual(['a', 'b', 'root']);
  });

  it('reads pnpm workspaces and honours negated patterns', () => {
    const project = write({
      'package.json': '{"name":"root","private":true}',
      'pnpm-workspace.yaml': "packages:\n    - 'apps/*'\n    - '!apps/skip'\n",
      'apps/one/package.json': '{"name":"one"}',
      'apps/skip/package.json': '{"name":"skip"}',
    });

    expect(names(path.join(project, 'apps/one'))).toEqual(['one', 'root']);
  });

  it('does not look for a workspace above the repository root', () => {
    const project = write({
      'package.json': '{"name":"outer","workspaces":["repo/packages/*"]}',
      'repo/.git/HEAD': 'ref: refs/heads/main\n',
      'repo/packages/app/package.json': '{"name":"app","private":true}',
    });

    expect(names(path.join(project, 'repo/packages/app'))).toEqual(['app']);
  });

  it('calls a package published only when it is public and says what it ships', () => {
    const project = write({
      'package.json': '{"name":"root","private":true,"workspaces":["pkg/*"]}',
      'pkg/lib/package.json': '{"name":"lib","exports":"./src/index.ts"}',
      'pkg/bare/package.json': '{"name":"bare","version":"1.0.0"}',
      'pkg/hidden/package.json': '{"name":"hidden","private":true,"main":"index.js"}',
    });
    const { packages, packageOf } = loadPackages(path.join(project, 'pkg/lib'), layout);

    expect(
      packages.map(({ name, published }) => `${name} ${String(published)}`).toSorted(),
    ).toEqual(['bare false', 'hidden false', 'lib true', 'root false']);
    expect(packageOf(path.join(project, 'pkg/lib/src/a.ts')).name).toBe('lib');
    expect(packageOf(path.join(project, 'other/a.ts')).name).toBe('root');
  });
});
