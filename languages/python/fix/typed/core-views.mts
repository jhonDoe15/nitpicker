import { collectProjectFiles as untypedCollectProjectFiles } from '../../../../core/fix/all-files/project-files.mts';
import { createSnapshot as untypedCreateSnapshot } from '../../../../core/fix/engine/edits/snapshot.mts';
import { defineRecipes as untypedDefineRecipes } from '../../../../core/fix/engine/recipes.mts';
import type { FileRecipe, PlanFile, ProjectRecipe, ScriptRecipe } from './fix-types.mts';

type Recipe = FileRecipe | ProjectRecipe | ScriptRecipe;

export function defineRecipes(recipes: readonly Recipe[]): readonly Recipe[] {
  untypedDefineRecipes(recipes);
  return Object.freeze([...recipes]);
}

export const collectProjectFiles: (options: {
  readonly projectRoot: string;
  readonly accepts: (name: string) => boolean;
  readonly scope: undefined;
}) => { readonly files: readonly { readonly path: string }[] } = untypedCollectProjectFiles;

export const createSnapshot: (
  projectRoot: string,
  names: readonly string[],
) => { readonly files: PlanFile[] } = untypedCreateSnapshot;
