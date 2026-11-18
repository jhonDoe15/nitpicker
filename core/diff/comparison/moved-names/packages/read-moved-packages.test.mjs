import { describe, expect, it } from 'vitest';
import { renameFile, writeFiles } from '../../../git/test-support/fixture-files.mts';
import { commit, fixtureGit, useGitFixtures } from '../../../git/test-support/git-repository.mts';
import { readMovedPackages } from './read-moved-packages.mjs';

const { createGitRepository } = useGitFixtures();

const KOTLIN = 'src/main/kotlin/com/acme/shop';

function unit(packageName, name) {
  return `package ${packageName}\n\nclass ${name}\n`;
}

function inScope(scope, files) {
  return Object.fromEntries(
    Object.entries(files).map(([file, text]) => [scope === '' ? file : `${scope}/${file}`, text]),
  );
}

function movedRepository({ before, after, renames, scope = '' }) {
  const at = (file) => (scope === '' ? file : `${scope}/${file}`);
  const repository = createGitRepository(inScope(scope, before));
  for (const [from, to] of renames) {
    renameFile(repository.root, at(from), at(to));
  }
  writeFiles(repository.root, inScope(scope, after));
  commit(repository.root, 'move');
  const headSha = fixtureGit(repository.root, ['rev-parse', 'HEAD']).trim();
  const snapshot = {
    repositoryRoot: repository.root,
    mergeBaseSha: repository.baseSha,
    headSha,
    projectRelativePath: scope === '' ? '.' : scope,
    baseProjectRelativePath: scope === '' ? '.' : scope,
  };
  return readMovedPackages({ files: new Map(renames) }, snapshot);
}

function wholeMove(packageName, target) {
  const folder = (name) => `src/main/java/${name.replaceAll('.', '/')}`;
  const files = ['A', 'B'].map((name) => [
    `${folder(packageName)}/${name}.java`,
    `${folder(target)}/${name}.java`,
  ]);
  return {
    before: Object.fromEntries(
      files.map(([from], index) => [from, unit(packageName, `C${index}`)]),
    ),
    after: Object.fromEntries(files.map(([, to], index) => [to, unit(target, `C${index}`)])),
    renames: files,
  };
}

describe('packages and names read from the files of a move', () => {
  it('maps a Kotlin package whose folders omit the common root, and its classes', () => {
    const before = {
      [`${KOTLIN}/service/A.kt`]: unit('shop.service', 'A'),
      [`${KOTLIN}/service/B.kt`]: unit('shop.service', 'B'),
      [`${KOTLIN}/web/C.kt`]: unit('shop.web', 'C'),
    };
    const { packages, declared } = movedRepository({
      before,
      renames: [
        [`${KOTLIN}/service/A.kt`, `${KOTLIN}/audit/A.kt`],
        [`${KOTLIN}/service/B.kt`, `${KOTLIN}/audit/B.kt`],
      ],
      after: {
        [`${KOTLIN}/audit/A.kt`]: unit('shop.audit', 'A'),
        [`${KOTLIN}/audit/B.kt`]: unit('shop.audit', 'B'),
      },
    });

    expect(packages.get('shop.service')).toBe('shop.audit');
    expect(declared.names.get('shop.service.A')).toBe('shop.audit.A');
  });

  it('keeps a package whose files moved folders but kept their package line', () => {
    const before = {
      'src/main/java/shop/service/A.java': unit('shop.service', 'A'),
      'src/main/java/shop/service/B.java': unit('shop.service', 'B'),
    };
    const { packages, declared } = movedRepository({
      before,
      renames: [
        ['src/main/java/shop/service/A.java', 'src/main/java/shop/audit/A.java'],
        ['src/main/java/shop/service/B.java', 'src/main/java/shop/audit/B.java'],
      ],
      after: {},
    });

    expect(packages.size).toBe(0);
    expect(declared.names.size).toBe(0);
  });

  it('keeps the old package for the files that stayed when only some moved', () => {
    const before = {
      'src/main/java/shop/service/A.java': unit('shop.service', 'A'),
      'src/main/java/shop/service/B.java': unit('shop.service', 'B'),
      'src/main/java/shop/service/C.java': unit('shop.service', 'C'),
    };
    const { packages, declared } = movedRepository({
      before,
      renames: [
        ['src/main/java/shop/service/A.java', 'src/main/java/shop/audit/A.java'],
        ['src/main/java/shop/service/B.java', 'src/main/java/shop/audit/B.java'],
      ],
      after: {
        'src/main/java/shop/audit/A.java': unit('shop.audit', 'A'),
        'src/main/java/shop/audit/B.java': unit('shop.audit', 'B'),
      },
    });

    expect(packages.has('shop.service')).toBe(false);
    expect(declared.names.get('shop.service.A')).toBe('shop.audit.A');
  });

  it('keeps a package that another folder still declares, even without a shared path', () => {
    const before = {
      [`${KOTLIN}/service/A.kt`]: unit('shop.service', 'A'),
      [`${KOTLIN}/service/B.kt`]: unit('shop.service', 'B'),
      'src/main/kotlin/elsewhere/C.kt': unit('shop.service', 'C'),
    };
    const { packages } = movedRepository({
      before,
      renames: [
        [`${KOTLIN}/service/A.kt`, `${KOTLIN}/audit/A.kt`],
        [`${KOTLIN}/service/B.kt`, `${KOTLIN}/audit/B.kt`],
      ],
      after: {
        [`${KOTLIN}/audit/A.kt`]: unit('shop.audit', 'A'),
        [`${KOTLIN}/audit/B.kt`]: unit('shop.audit', 'B'),
      },
    });

    expect(packages.has('shop.service')).toBe(false);
  });

  it('falls back to the path names for a renamed file that is not text', () => {
    const { declared } = movedRepository({
      before: { 'src/main/java/shop/A.java': '\u0000\u0001\u0002' },
      renames: [['src/main/java/shop/A.java', 'src/main/java/shop/audit/A.java']],
      after: {},
    });

    expect(declared.covered.size).toBe(0);
  });

  it('records the folders whose every file moved to one new folder', () => {
    const before = {
      'lib/src/A.java': unit('shop', 'A'),
      'core/src/B.java': unit('shop', 'B'),
      'core/src/C.java': unit('shop', 'C'),
    };
    const { declared } = movedRepository({
      before,
      renames: [
        ['lib/src/A.java', 'libs/lib/src/A.java'],
        ['core/src/B.java', 'app/src/B.java'],
      ],
      after: {},
    });

    expect(declared.folders.get('lib')).toBe('libs/lib');
    expect(declared.folders.has('core')).toBe(false);
  });

  it.each([
    ['spaces around the dot', 'package a . b;\nclass S {}'],
    ['a line break after the keyword', 'package\na.b;\nclass S {}'],
    ['a comment inside the clause', 'package /* x */ a.b;\nclass S {}'],
    ['an annotation before it', '@Deprecated package a.b;\nclass S {}'],
  ])('keeps a package whose stayer writes the clause with %s', (_name, stayer) => {
    const move = wholeMove('a.b', 'a.c');
    const { packages } = movedRepository({
      ...move,
      before: { ...move.before, 'src/main/java/elsewhere/S.java': stayer },
    });

    expect(packages.has('a.b')).toBe(false);
    expect(movedRepository(wholeMove('a.b', 'a.c')).packages.get('a.b')).toBe('a.c');
  });

  it('maps a package whose name holds a dollar sign', () => {
    const { packages } = movedRepository(wholeMove('shop.in$ner', 'shop.outer'));

    expect(packages.get('shop.in$ner')).toBe('shop.outer');
  });

  it('reads a project folder whose name holds glob characters', () => {
    const { packages } = movedRepository({
      ...wholeMove('a.b', 'a.c'),
      scope: 'mod[1]',
    });
    const stayer = movedRepository({
      ...wholeMove('a.b', 'a.c'),
      scope: 'mod[1]',
      before: {
        ...wholeMove('a.b', 'a.c').before,
        'src/main/java/elsewhere/S.java': 'package a . b;\nclass S {}',
      },
    });

    expect(packages.get('a.b')).toBe('a.c');
    expect(stayer.packages.has('a.b')).toBe(false);
  });

  it('maps many moved packages in one run', () => {
    const moves = Array.from({ length: 1500 }, (_, index) =>
      wholeMove(
        `shop.service.package${String(index).padStart(4, '0')}`,
        `shop.audit.package${String(index).padStart(4, '0')}`,
      ),
    );
    const merged = {
      before: Object.assign({}, ...moves.map((move) => move.before)),
      after: Object.assign({}, ...moves.map((move) => move.after)),
      renames: moves.flatMap((move) => move.renames),
    };
    const { packages } = movedRepository(merged);

    expect(packages.size).toBe(1500);
    expect(packages.get('shop.service.package0007')).toBe('shop.audit.package0007');
  });
});
