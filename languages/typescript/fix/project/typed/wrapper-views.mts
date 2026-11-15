import type TypeScript from 'typescript';
import { importSpecifier as untypedImportSpecifier } from '../imports/retarget.mts';
import { removalEdit as untypedRemovalEdit } from '../reuse/declarations.mts';
import type { Project, ReplaceEdit } from './project-types.mts';

export type { TargetOrigin, WrapperDeclaration } from '../wrappers/wrapper-target.mts';
export { targetOrigin, wrapperDeclaration } from '../wrappers/wrapper-target.mts';

const importSpecifier: (project: Project, from: string, target: string) => string =
  untypedImportSpecifier;

const removalEdit: (path: string, statement: TypeScript.Node) => ReplaceEdit = untypedRemovalEdit;

export { importSpecifier, removalEdit };
