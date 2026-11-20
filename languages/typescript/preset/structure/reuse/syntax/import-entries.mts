import type TypeScript from 'typescript';
import { fileImports } from '../../../syntax/module-facts.mts';

type ImportEntry = {
  readonly specifier: string;
  readonly local: string;
  readonly imported: string;
};

export function importEntries(sourceFile: TypeScript.SourceFile): ImportEntry[] {
  return fileImports(sourceFile).flatMap(({ specifier, defaultName, namespaceName, named }) => [
    ...(defaultName === undefined ? [] : [{ specifier, local: defaultName, imported: 'default' }]),
    ...(namespaceName === undefined ? [] : [{ specifier, local: namespaceName, imported: '*' }]),
    ...named.map(({ local, imported }) => ({ specifier, local, imported })),
  ]);
}
