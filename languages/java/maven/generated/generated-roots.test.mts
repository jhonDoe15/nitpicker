import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { useGitFixtures } from '../../../../core/diff/git/test-support/git-repository.mts';
import { handWrittenRoots, isGeneratedRoot } from './generated-roots.mts';
import { readRootCases } from './test-support/root-cases.mts';

const ROOT_CASES = readRootCases();

describe('generated roots', () => {
  const { temporaryRoot } = useGitFixtures();
  const basedirOf = (): string => temporaryRoot('nitpicker-generated-roots-');
  const roots = ['src/main/java', 'target/generated-sources/protobuf/java', 'build/gen'];

  it('leaves out roots under the build directory and generated build output', () => {
    const basedir = basedirOf();
    const module = { basedir, buildDirectory: path.join(basedir, 'build') };
    const absolute = roots.map((root) => path.join(basedir, root));
    expect(handWrittenRoots(module, absolute, undefined)).toEqual([absolute[0]]);
    expect(isGeneratedRoot(module, path.join(basedir, roots[1] ?? ''))).toBe(true);
  });

  it('defaults the build directory to target', () => {
    const basedir = basedirOf();
    const generated = path.join(basedir, 'target/generated-test-sources/test-annotations');
    expect(isGeneratedRoot({ basedir }, generated)).toBe(true);
    expect(isGeneratedRoot({ basedir }, path.join(basedir, 'src/test/java'))).toBe(false);
  });

  it('keeps every root when the project opts in to generated code', () => {
    const basedir = basedirOf();
    const absolute = roots.map((root) => path.join(basedir, root));
    const configs = { generated: { analyze: true } };
    expect(handWrittenRoots({ basedir }, absolute, configs)).toEqual(absolute);
  });

  it('treats a build directory that is the module, or holds it, as no generated root', () => {
    const basedir = basedirOf();
    const module = { basedir, buildDirectory: basedir };
    expect(isGeneratedRoot(module, path.join(basedir, 'src/main/java'))).toBe(false);
    expect(isGeneratedRoot({ basedir, buildDirectory: path.dirname(basedir) }, basedir)).toBe(
      false,
    );
  });

  it.each(ROOT_CASES)('agrees with the shared case $root under $buildDir', (rootCase) => {
    const basedir = basedirOf();
    const module = { basedir, buildDirectory: path.join(basedir, rootCase.buildDir) };
    expect(isGeneratedRoot(module, path.join(basedir, rootCase.root))).toBe(rootCase.generated);
  });
});
