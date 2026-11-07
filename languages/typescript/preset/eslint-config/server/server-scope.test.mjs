import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { lintFixture } from '../../failure-messages/test-support/harness.mjs';
import { defaultResolvedLayout } from '../../layout.mjs';
import { isServerProject, serverScopeConfigFor } from './server-scope.mjs';

const roots = [];

afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

function projectWith(manifest) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-server-scope-'));
  roots.push(root);
  writeFileSync(path.join(root, 'package.json'), JSON.stringify(manifest));
  return root;
}

function ruleIdsFor(filename, code, browser = false) {
  return lintFixture({
    config: serverScopeConfigFor(defaultResolvedLayout, { browser }),
    filename,
    code,
  })
    .map(({ ruleId }) => ruleId)
    .filter((ruleId) => ruleId !== null);
}

const LOCAL_HOUR = 'export const hour = () => new Date().getHours();';

describe('server scope', () => {
  it.each([
    [{ dependencies: { express: '^5.0.0' } }, true],
    [{ dependencies: { '@nestjs/core': '^11.0.0' } }, true],
    [{ peerDependencies: { fastify: '^5.0.0' } }, true],
    [{ dependencies: { hono: '^4.0.0', react: '^19.0.0' } }, true],
    [{ devDependencies: { express: '^5.0.0' } }, false],
    [{ dependencies: { react: '^19.0.0' } }, false],
    [{}, false],
  ])('treats %j as a server project: %s', (manifest, expected) => {
    expect(isServerProject(projectWith(manifest))).toBe(expected);
  });

  it('reports local time in production code of a server project', () => {
    expect(ruleIdsFor('src/clock.ts', LOCAL_HOUR)).toEqual(['nitpicker/no-local-time-zone']);
  });

  it('leaves tests and test support out', () => {
    expect(ruleIdsFor('src/clock.test.ts', LOCAL_HOUR)).toEqual([]);
    expect(ruleIdsFor('src/test-support/clock.ts', LOCAL_HOUR)).toEqual([]);
  });

  it('leaves component files out when the project also has a browser framework', () => {
    expect(ruleIdsFor('src/view.tsx', LOCAL_HOUR, true)).toEqual([]);
    expect(ruleIdsFor('src/view.tsx', LOCAL_HOUR)).toEqual(['nitpicker/no-local-time-zone']);
    expect(ruleIdsFor('src/clock.ts', LOCAL_HOUR, true)).toEqual(['nitpicker/no-local-time-zone']);
  });
});
