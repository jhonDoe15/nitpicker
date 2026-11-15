import type TypeScript from 'typescript';
import { importSpecifier as untypedImportSpecifier } from '../imports/retarget.mjs';
import { removalEdit as untypedRemovalEdit } from '../reuse/declarations.mjs';
import {
  targetOrigin as untypedTargetOrigin,
  wrapperDeclaration as untypedWrapperDeclaration,
} from '../wrappers/wrapper-target.mjs';
import type { Project, ReplaceEdit } from './project-types.mts';

export type WrapperDeclaration = {
  readonly statement: TypeScript.Statement;
  readonly fn: TypeScript.Node;
  readonly nameNode: TypeScript.Identifier;
};

export type TargetOrigin = {
  readonly module: string;
  readonly imported: string;
  readonly local: string;
};

const importSpecifier: (project: Project, from: string, target: string) => string =
  untypedImportSpecifier;

const removalEdit: (path: string, statement: TypeScript.Node) => ReplaceEdit = untypedRemovalEdit;

const wrapperDeclaration: (
  sourceFile: TypeScript.SourceFile | undefined,
  name: string,
) => WrapperDeclaration | undefined = untypedWrapperDeclaration;

const targetOrigin: (
  project: Project,
  target: { readonly name: string; readonly fn: TypeScript.Node },
) => TargetOrigin | undefined = untypedTargetOrigin;

export { importSpecifier, removalEdit, targetOrigin, wrapperDeclaration };
