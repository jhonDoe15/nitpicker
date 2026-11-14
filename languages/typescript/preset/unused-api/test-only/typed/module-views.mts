import type TypeScript from 'typescript';
import {
  packageNameOf as untypedPackageNameOf,
  resolveModuleSpecifier as untypedResolveModuleSpecifier,
} from '../../../modules/module-resolution.mjs';
import {
  exportLine as untypedExportLine,
  fileAliasReads as untypedFileAliasReads,
  fileDynamicImports as untypedFileDynamicImports,
  fileExports as untypedFileExports,
  fileImports as untypedFileImports,
} from '../../../syntax/module-facts.mjs';
import { referenceMembers as untypedReferenceMembers } from '../../../syntax/references.mjs';
import type { ImportFact, ModuleExports } from './graph-types.mts';

type SourceFile = TypeScript.SourceFile;

export const packageNameOf: (specifier: string) => string = untypedPackageNameOf;
export const resolveModuleSpecifier: (
  written: string,
  containingFile: string,
) => { readonly kind: string; readonly path?: string | undefined } = untypedResolveModuleSpecifier;
export const exportLine: (sourceFile: SourceFile, name: string) => number | undefined =
  untypedExportLine;
export const fileAliasReads: (sourceFile: SourceFile) => TypeScript.Node[] = untypedFileAliasReads;
export const fileDynamicImports: (sourceFile: SourceFile) => string[] = untypedFileDynamicImports;
export const fileExports: (sourceFile: SourceFile) => ModuleExports = untypedFileExports;
export const fileImports: (sourceFile: SourceFile) => ImportFact[] = untypedFileImports;
export const referenceMembers: (
  nodes: readonly SourceFile[],
  ignored: TypeScript.Node[],
) => Map<string, string[] | undefined> = untypedReferenceMembers;
