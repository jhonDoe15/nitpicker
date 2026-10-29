import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { PACKAGE_ROOT, isToolInstalled, resolveTool } from '../../tooling/tool-resolution.mjs';
import { runAnalyzers } from './run-analyzers.mjs';
import { resolveAnalyzerVersion } from '../../../languages/typescript/preset/analyzer-versions.mjs';
import { linkSentence } from '../../../shared/messages/test-support/link-sentence.mjs';

const roots = [];
const { peerDependencies } = JSON.parse(
  readFileSync(path.join(PACKAGE_ROOT, 'package.json'), 'utf8'),
);

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function projectWithoutPackages() {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-missing-peer-')));
  roots.push(root);
  writeFileSync(path.join(root, 'package.json'), '{"name":"app","private":true}\n');
  return root;
}

function missingVitest(root) {
  return (
    `Required tool vitest is not installed from ${root}. ` +
    `Install vitest ${peerDependencies.vitest} as a dev dependency of the project. ` +
    linkSentence('missingPeer')
  );
}

describe('a peer tool the project does not have', () => {
  it('is reported as missing by the real resolver, not as a resolution crash', () => {
    const root = projectWithoutPackages();

    expect(isToolInstalled('vitest', { projectRoot: root })).toBe(false);
    expect(() => resolveTool('vitest', { projectRoot: root })).toThrow(
      new Error(missingVitest(root)),
    );
  });

  it.each(['base', 'head'])(
    'is a tool error with the missing-peer link for each test analyzer on the %s',
    (snapshot) => {
      const root = projectWithoutPackages();
      const analyzers = ['coverage', 'mutation', 'test-console'].map((name) => ({
        name,
        dependencies: [],
        configurationHash: 'test',
        exclusions: [],
        resolveVersion: (liveProjectRoot) => resolveAnalyzerVersion(name, liveProjectRoot),
        createInvocation: () => {
          throw new Error(`${name} must not start`);
        },
      }));

      const { toolErrors } = runAnalyzers({
        analyzers,
        projectRoot: root,
        policyRoot: PACKAGE_ROOT,
        toolRoot: PACKAGE_ROOT,
        liveProjectRoot: root,
        snapshot,
      });

      expect(toolErrors).toEqual(
        ['coverage', 'mutation', 'test-console'].map((tool) => ({
          tool,
          snapshot,
          message: missingVitest(root),
        })),
      );
    },
  );
});
