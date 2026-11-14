import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { PACKAGE_ROOT, isToolInstalled, resolveTool } from '../../tooling/tool-resolution.mjs';
import { runAnalyzers } from './run-analyzers.mts';
import { resolveAnalyzerVersion } from '../../../languages/typescript/preset/analyzer-versions.mjs';
import { fieldAt } from '../../../scripts/json/fields.mts';
import { parseJson, textOf } from '../../../shared/values/readers.mts';
import { linkSentence } from '../../../shared/messages/test-support/link-sentence.mjs';

const toolInstalled: (
  name: string,
  location: { projectRoot: string; packageRoot?: string },
) => boolean = isToolInstalled;
const toolResolved: (
  name: string,
  location: { projectRoot: string; packageRoot?: string },
) => unknown = resolveTool;
const analyzerVersion: (name: string, liveProjectRoot: string) => unknown = resolveAnalyzerVersion;
const sentence: (key: string) => string | undefined = linkSentence;

const roots: string[] = [];
const vitestRange = textOf(
  fieldAt(
    parseJson(readFileSync(path.join(PACKAGE_ROOT, 'package.json'), 'utf8')),
    'peerDependencies',
    'vitest',
  ),
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

function missingVitest(root: string): string {
  return (
    `Required tool vitest is not installed from ${root}. ` +
    `Install vitest ${vitestRange} as a dev dependency of the project. ` +
    `If npm 10 failed to install it with "reading 'edgesOut'", install with npm 11 ` +
    '(`npx npm@11 install`) or use Vitest 5. ' +
    textOf(sentence('missingPeer'))
  );
}

describe('a peer tool the project does not have', () => {
  it('is reported as missing by the real resolver, not as a resolution crash', () => {
    const root = projectWithoutPackages();

    expect(toolInstalled('vitest', { projectRoot: root })).toBe(false);
    expect(() => toolResolved('vitest', { projectRoot: root })).toThrow(
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
        resolveVersion: (liveProjectRoot: string) => analyzerVersion(name, liveProjectRoot),
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
        baselineRoot: undefined,
        baselineMovesFile: undefined,
        headPolicyFile: undefined,
        mutationScope: undefined,
        logRoot: undefined,
        runTasks: undefined,
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
