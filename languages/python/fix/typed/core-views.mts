import { collectProjectFiles as untypedCollectProjectFiles } from '../../../../core/fix/all-files/project-files.mjs';
import { createSnapshot as untypedCreateSnapshot } from '../../../../core/fix/engine/edits/snapshot.mjs';
import { defineRecipes as untypedDefineRecipes } from '../../../../core/fix/engine/recipes.mjs';
import type { FileRecipe, PlanFile, ProjectRecipe, ScriptRecipe } from './fix-types.mts';

type Recipe = FileRecipe | ProjectRecipe | ScriptRecipe;

export const defineRecipes: (recipes: readonly Recipe[]) => readonly Recipe[] =
  untypedDefineRecipes;

export const collectProjectFiles: (options: {
  readonly projectRoot: string;
  readonly accepts: (name: string) => boolean;
  readonly scope: undefined;
}) => { readonly files: readonly { readonly path: string }[] } = untypedCollectProjectFiles;

export const createSnapshot: (
  projectRoot: string,
  names: readonly string[],
) => { readonly files: PlanFile[] } = untypedCreateSnapshot;
