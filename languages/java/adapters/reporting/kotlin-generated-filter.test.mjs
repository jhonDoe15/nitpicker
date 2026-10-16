import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { kotlinGeneratedFilter } from './kotlin-reports.mjs';

const roots = [];
afterEach(() => {
  roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true }));
});

function project(generatedRoots) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-kotlin-generated-')));
  roots.push(root);
  const reportRoot = path.join(root, 'build/nitpicker');
  mkdirSync(reportRoot, { recursive: true });
  writeFileSync(path.join(reportRoot, 'kotlin-mutation-facts.json'), '{"files":[]}');
  for (const [directory, file] of [
    ['build/generated/ksp/main/kotlin/demo', 'UserMapper.kt'],
    ['build/generated/source/kapt/main/demo', 'UserDao_Impl.java'],
  ]) {
    mkdirSync(path.join(root, directory), { recursive: true });
    writeFileSync(path.join(root, directory, file), '');
  }
  return {
    reportRoot,
    projectRoot: root,
    manifest: { kotlinGeneratedSourceRoots: generatedRoots },
  };
}

const mutant = (className, sourceFile) => ({
  className,
  sourceFile,
  method: 'map',
  methodDescription: '()V',
  mutatorName: 'NullReturnValsMutator',
  description: 'replaced return value with null',
  line: 3,
});

describe('the generated source directories of the manifest', () => {
  it('drop the mutants of the files in them and keep the mutants of the other files', () => {
    const filter = kotlinGeneratedFilter(
      project(['build/generated/ksp/main/kotlin', 'build/generated/source/kapt/main']),
    );

    expect([
      filter(mutant('demo.UserMapper', 'UserMapper.kt'), undefined),
      filter(mutant('demo.UserDao_Impl', 'UserDao_Impl.java'), undefined),
      filter(mutant('demo.UserService', 'UserService.kt'), 'src/main/kotlin/demo/UserService.kt'),
    ]).toEqual(['generated-source', 'generated-source', undefined]);
  });

  it('are optional, and a directory that does not exist drops nothing', () => {
    const filter = kotlinGeneratedFilter(project(['build/generated/ksp/missing']));

    expect(filter(mutant('demo.UserMapper', 'UserMapper.kt'), undefined)).toBeUndefined();
  });
});
