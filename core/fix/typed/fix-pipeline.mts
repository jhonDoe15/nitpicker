import {
  changedFiles as untypedChangedFiles,
  collectFixFiles as untypedCollectFixFiles,
  readBytes as untypedReadBytes,
  rewrittenPaths as untypedRewrittenPaths,
} from '../common/fix-files.mjs';
import { linkNote as untypedLinkNote } from '../common/fix-notes.mjs';
import { runRecipes as untypedRunRecipes } from '../engine/run-recipes.mjs';
import { sharedInputs as untypedSharedInputs } from '../recipes/shared-inputs.mjs';
import type { FixFile, FixSettings, FixStep } from './fix-types.mts';

export type Bytes = ReadonlyMap<string, Buffer>;
export type RecipeResult = FixStep & { readonly files: readonly FixFile[] };
type SharedInputs = { readonly inputs: object; readonly toolErrors: readonly unknown[] };

export const collectFixFiles: (options: {
  readonly repositoryRoot: string;
  readonly projectRoot: string;
  readonly baseRef: unknown;
  readonly scope: unknown;
  readonly allFiles: boolean;
  readonly accepts: (name: string) => boolean;
}) => {
  readonly comparison: { readonly mergeBaseSha: string | undefined };
  readonly files: readonly FixFile[];
  readonly links: readonly string[];
} = untypedCollectFixFiles;
export const readBytes: (projectRoot: string, files: readonly FixFile[]) => Bytes =
  untypedReadBytes;
export const changedFiles: (
  projectRoot: string,
  files: readonly FixFile[],
  before: Bytes,
) => readonly FixFile[] = untypedChangedFiles;
export const rewrittenPaths: (
  projectRoot: string,
  files: readonly FixFile[],
  before: Bytes,
) => readonly string[] = untypedRewrittenPaths;
export const linkNote: (paths: readonly string[]) => string[] = untypedLinkNote;
export const runRecipes: (options: {
  readonly projectRoot: string;
  readonly files: readonly FixFile[];
  readonly recipes: readonly unknown[];
  readonly writer: FixSettings['writer'];
  readonly preset: string;
  readonly selectedRules: readonly string[];
  readonly accepts: (name: string) => boolean;
  readonly inputs: object;
}) => RecipeResult = untypedRunRecipes;
export const sharedInputs: (options: {
  readonly projectRoot: string;
  readonly headPolicy: object | undefined;
  readonly selectedRules: readonly string[];
}) => SharedInputs = untypedSharedInputs;
