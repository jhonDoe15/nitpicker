import type TypeScript from 'typescript';
import type { Reference, Registry, Target } from '../typed/context-types.mts';

export type MemberSite = {
  readonly name: string;
  readonly fileName: string;
  readonly line: number;
};

export type TargetData = Pick<Target, 'name' | 'kind' | 'package'> & {
  readonly members: readonly MemberSite[];
  readonly refs: readonly Reference[];
};

export type RegistryData = {
  readonly targets: readonly TargetData[];
  readonly cloned: readonly Reference[];
};

function declarationLine(declaration: TypeScript.Declaration): number {
  const sourceFile = declaration.getSourceFile();
  return sourceFile.getLineAndCharacterOfPosition(declaration.getStart(sourceFile)).line + 1;
}

function memberSite([name, declaration]: readonly [string, TypeScript.Declaration]): MemberSite {
  return {
    name,
    fileName: declaration.getSourceFile().fileName,
    line: declarationLine(declaration),
  };
}

export function registryData(registry: Registry): RegistryData {
  return {
    targets: registry.targets.map(({ name, kind, package: owner, members, refs }) => ({
      name,
      kind,
      package: owner,
      members: [...members].map(memberSite),
      refs,
    })),
    cloned: registry.cloned,
  };
}
