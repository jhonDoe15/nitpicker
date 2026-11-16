import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { sharingProjects } from './shared-base.mts';

const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-sharing-'));

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

function row(repoPath, files = [], selected = true) {
  const absolute = path.join(root, repoPath);
  mkdirSync(absolute, { recursive: true });
  for (const file of files) {
    writeFileSync(path.join(absolute, file), '');
  }
  return { project: { path: repoPath, repoPath, absolute }, selection: { selected } };
}

function sharing(rows, changed = []) {
  return sharingProjects(rows, changed).map(({ path: folder }) => folder);
}

describe('projects that share the base checkout', () => {
  it('shares among selected projects that hold no other selected project', () => {
    expect(sharing([row('.'), row('web'), row('api'), row('docs', [], false)])).toEqual([
      'web',
      'api',
    ]);
  });
  it('keeps a Gradle project without its own settings out, since Gradle builds it from above', () => {
    expect(
      sharing([
        row('services/orders', ['build.gradle.kts']),
        row('services/billing', ['build.gradle', 'settings.gradle']),
        row('web'),
      ]),
    ).toEqual(['services/billing', 'web']);
  });
  it('keeps a Gradle build out when it includes a build outside its own folder', () => {
    const orders = row('services/orders', ['settings.gradle.kts']);
    writeFileSync(
      path.join(orders.project.absolute, 'settings.gradle.kts'),
      'includeBuild("../shared")\n',
    );

    expect(sharing([orders, row('services/billing', ['settings.gradle']), row('web')])).toEqual([
      'services/billing',
      'web',
    ]);
  });
  it('shares nothing when the change edits dependency manifests, so each project prepares its own', () => {
    expect(sharing([row('web'), row('api')], ['api/package.json'])).toEqual([]);
    expect(sharing([row('web'), row('api')], ['pnpm-lock.yaml'])).toEqual([]);
    expect(sharing([row('web'), row('api')], ['api/src/index.ts'])).toEqual(['web', 'api']);
  });
  it('shares nothing when fewer than two projects could share', () => {
    expect(sharing([row('web'), row('web/admin')])).toEqual([]);
  });
});
