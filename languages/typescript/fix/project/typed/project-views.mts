import type TypeScript from 'typescript';
import {
  exportsName as untypedExportsName,
  symbolReferenceProblem as untypedSymbolReferenceProblem,
} from '../edits/declines.mjs';
import { planFileMove as untypedPlanFileMove } from '../edits/file-move.mjs';
import { renameEdits as untypedRenameEdits } from '../edits/symbol-rename.mjs';
import { composed as untypedComposed, declined as untypedDeclined } from '../edits/text-edits.mjs';
import { verifyEdits as untypedVerifyEdits } from '../edits/verify-edits.mjs';
import {
  moduleReferences as untypedModuleReferences,
  referencesTo as untypedReferencesTo,
} from '../model/module-references.mjs';
import { inCasing as untypedInCasing } from '../model/names.mjs';
import {
  isCodeFile as untypedIsCodeFile,
  layoutOf as untypedLayoutOf,
  productionScope as untypedProductionScope,
  withProject as untypedWithProject,
} from '../model/project-model.mjs';
import type {
  FixContext,
  FixInputs,
  FixLayout,
  Planned,
  Project,
  ProjectEdit,
  ReplaceEdit,
} from './project-types.mts';

type ModuleReference = {
  readonly kind: 'import' | 'export' | 'dynamic' | 'require' | 'type-import';
  readonly node: TypeScript.Node;
  readonly specifier: string | undefined;
};

export type ImporterReference = ModuleReference & { readonly importer: string };

const exportsName: (project: Project, name: string, symbolName: string) => boolean =
  untypedExportsName;

const symbolReferenceProblem: (
  project: Project,
  reference: { readonly target: string; readonly exportName: string },
) => string | undefined = untypedSymbolReferenceProblem;

const planFileMove: (
  context: FixContext,
  project: Project,
  move: { readonly from: string; readonly to: string },
) => Planned = untypedPlanFileMove;

const renameEdits: (
  project: Project,
  rename: {
    readonly name: string;
    readonly offset: number;
    readonly newName: string;
    readonly accepts: (name: string) => boolean;
  },
) => Planned<ReplaceEdit> = untypedRenameEdits;

const composed: (text: string, edits: readonly ProjectEdit[]) => string = untypedComposed;

const declined: (reason: string) => { readonly declined: string } = untypedDeclined;

function replaceEdit(
  path: string,
  [start, end]: readonly [number, number],
  text: string,
): ReplaceEdit {
  return { type: 'replace', path, start, end, text };
}

const verifyEdits: (
  context: FixContext,
  project: Project,
  edits: readonly ProjectEdit[],
) => string | undefined = untypedVerifyEdits;

const moduleReferences: (
  sourceFile: TypeScript.SourceFile | undefined,
) => readonly ModuleReference[] = untypedModuleReferences;

const referencesTo: (project: Project, target: string) => readonly ImporterReference[] =
  untypedReferencesTo;

const inCasing: (name: string, casing: string) => string | undefined = untypedInCasing;

const isCodeFile: (name: string) => boolean = untypedIsCodeFile;

const layoutOf: (inputs: FixInputs | undefined) => FixLayout = untypedLayoutOf;

const productionScope: (
  inputs: FixInputs | undefined,
  extraGlobs?: string[],
) => (name: string) => boolean = untypedProductionScope;

const withProject: <T>(context: FixContext, work: (project: Project) => T) => T =
  untypedWithProject;

export {
  composed,
  declined,
  exportsName,
  inCasing,
  isCodeFile,
  layoutOf,
  moduleReferences,
  planFileMove,
  productionScope,
  referencesTo,
  renameEdits,
  replaceEdit,
  symbolReferenceProblem,
  verifyEdits,
  withProject,
};
