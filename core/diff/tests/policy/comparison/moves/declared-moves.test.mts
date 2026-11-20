import { describe, expect, it } from 'vitest';
import type { DeclaredMoves } from '../../../../comparison/moved-names/declared/move-types.mts';
import { declaredMoves } from '../../../../comparison/moved-names/declared/declared-moves.mts';
import { NO_DECLARED } from '../../../../comparison/moved-names/declared/no-declared-moves.mts';
import { movedFolders } from '../../../../comparison/moved-names/module-folders.mts';
import { held } from './test-support/held.mts';
import { finding } from '../../../../execution/test-support/analyzer-findings.mts';

type Rename = readonly [string, string];

const LEGACY = { fresh: 0, kept: 1 };

function declaredBy(
  ...files: readonly {
    readonly from: string;
    readonly to: string;
    readonly before: string;
    readonly after: string;
  }[]
): DeclaredMoves {
  return declaredMoves({
    renames: new Map(files.map(({ from, to }) => [from, to])),
    baseTexts: new Map(files.map(({ from, before }) => [from, before])),
    headTexts: new Map(files.map(({ to, after }) => [to, after])),
  });
}

function classFinding(filePath: string, name: string, rule = 'test-only-export') {
  return finding({ tool: 'coupling', rule, path: filePath, identity: `class:${name}` });
}

function folderMoves(baseFiles: readonly string[], renames: readonly Rename[]): DeclaredMoves {
  const moved = new Map(renames);
  return {
    ...NO_DECLARED,
    folders: movedFolders({ baseFiles, renames: moved }),
    packageDirs: new Set<string>(),
  };
}

function withPackageDirs(...directories: string[]): DeclaredMoves {
  return { ...NO_DECLARED, folders: new Map<string, string>(), packageDirs: new Set(directories) };
}

describe('findings of a module that moved with its folder', () => {
  const baseFiles = ['lib/src/A.java', 'lib/src/B.java', 'core/src/C.java', 'core/src/D.java'];
  const wholeLib: Rename[] = [
    ['lib/src/A.java', 'libs/lib/src/A.java'],
    ['lib/src/B.java', 'libs/lib/src/B.java'],
  ];
  const at = (project: string) =>
    finding({ tool: 'pit', rule: 'x', path: '.', identity: `survivors@${project}` });
  const folder = (place: string) =>
    finding({ tool: 'pit', rule: 'x', path: place, identity: 'survivors' });
  const moved = { renames: new Map(wholeLib), declared: folderMoves(baseFiles, wholeLib) };

  it('keeps a Gradle finding at the project root when the head project follows its folder', () => {
    expect(held(at(':lib'), at(':libs:lib'), moved)).toEqual(LEGACY);
    expect(held(at(':lib:core'), at(':libs:lib:core'), moved)).toEqual(LEGACY);
  });

  it('keeps a Maven finding whose path is the module folder', () => {
    expect(held(folder('lib'), folder('libs/lib'), moved)).toEqual(LEGACY);
    expect(held(folder('lib/core'), folder('libs/lib/core'), moved)).toEqual(LEGACY);
  });

  it('keeps the old project path when the head still has it, whatever the folder did', () => {
    expect(held(at(':lib'), at(':lib'), moved)).toEqual(LEGACY);
    expect(held(folder('lib'), folder('lib'), moved)).toEqual(LEGACY);
  });

  it('does not follow a folder when only some of its files moved', () => {
    const renames: Rename[] = [['core/src/C.java', 'app/src/C.java']];
    const partly = { renames: new Map(renames), declared: folderMoves(baseFiles, renames) };

    expect(held(at(':core'), at(':app'), partly)).toEqual({ fresh: 1, kept: 0 });
    expect(held(at(':core'), at(':core'), partly)).toEqual(LEGACY);
    expect(held(folder('core'), folder('core'), partly)).toEqual(LEGACY);
  });
});

describe('findings of classes whose package the path does not give', () => {
  it('maps a default-package Java class that moved into a package', () => {
    const declared = declaredBy({
      from: 'src/main/java/Root.java',
      to: 'src/main/java/shop/Root.java',
      before: 'class Root {}',
      after: 'package shop;\nclass Root {}',
    });
    const renames = new Map([['src/main/java/Root.java', 'src/main/java/shop/Root.java']]);

    expect(
      held(
        classFinding('src/main/java/Root.java', 'Root'),
        classFinding('src/main/java/shop/Root.java', 'shop.Root'),
        { renames, declared },
      ),
    ).toEqual(LEGACY);
  });

  it('maps a Kotlin class whose package omits the common root of its folders', () => {
    const [from, to] = [
      'src/main/kotlin/com/acme/shop/service/Audit.kt',
      'src/main/kotlin/com/acme/shop/audit/Audit.kt',
    ];
    const declared = declaredBy({
      from,
      to,
      before: 'package shop.service\nclass Audit',
      after: 'package shop.audit\nclass Audit',
    });

    expect(
      held(classFinding(from, 'shop.service.Audit'), classFinding(to, 'shop.audit.Audit'), {
        renames: new Map([[from, to]]),
        declared,
      }),
    ).toEqual(LEGACY);
  });

  it('keeps the old class name when the file moved but its package line did not', () => {
    const [from, to] = [
      'src/main/java/shop/service/Audit.java',
      'src/main/java/shop/audit/Audit.java',
    ];
    const text = 'package shop.service;\nclass Audit {}';
    const declared = declaredBy({ from, to, before: text, after: text });

    expect(
      held(classFinding(from, 'shop.service.Audit'), classFinding(to, 'shop.service.Audit'), {
        renames: new Map([[from, to]]),
        declared,
      }),
    ).toEqual(LEGACY);
  });

  it('maps a top-level Python module that moved into a package', () => {
    const cycle = (filePath: string, name: string) =>
      finding({
        tool: 'coupling',
        rule: 'module-cycle',
        path: filePath,
        identity: `module-cycle:${name}`,
      });

    expect(
      held(cycle('tax.py', 'tax'), cycle('shop/tax.py', 'shop.tax'), {
        renames: new Map([['tax.py', 'shop/tax.py']]),
        declared: withPackageDirs('shop'),
      }),
    ).toEqual(LEGACY);
    expect(
      held(cycle('tax.py', 'tax'), cycle('src/shop/tax.py', 'shop.tax'), {
        renames: new Map([['tax.py', 'src/shop/tax.py']]),
        declared: withPackageDirs('src/shop'),
      }),
    ).toEqual(LEGACY);
  });

  it('does not map the bare name of a module in a finding of another file', () => {
    const named = (filePath: string, identity: string) =>
      finding({ tool: 'python', rule: 'x', path: filePath, identity });
    const renames = new Map([['utils.py', 'helpers.py']]);

    expect(
      held(named('other.py', 'class:utils'), named('other.py', 'class:helpers'), { renames }),
    ).toEqual({
      fresh: 1,
      kept: 0,
    });
    expect(
      held(named('other.py', 'var:utils#3'), named('other.py', 'var:helpers#3'), { renames }),
    ).toEqual({
      fresh: 1,
      kept: 0,
    });
  });
});
