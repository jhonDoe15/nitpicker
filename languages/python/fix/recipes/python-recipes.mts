import type { FileRecipe, ProjectRecipe, ScriptRecipe } from '../typed/fix-types.mts';
import type { ScriptSettings } from '../typed/script-types.mts';
import { defineRecipes } from '../typed/core-views.mts';
import { localRunScript } from '../source/script-edits.mts';
import { scriptRecipes } from '../source/python-recipes.mts';
import { projectScriptRecipes } from '../source/project/project-recipes.mts';
import { pythonDependenciesRecipe } from './dependencies/dependency-recipe.mts';
import { pythonRestatingDocstringRecipe } from './restating-docstring.mts';

export function createPythonRecipes(
  script: ScriptSettings,
): readonly (FileRecipe | ProjectRecipe | ScriptRecipe)[] {
  return defineRecipes([
    ...scriptRecipes(script),
    ...projectScriptRecipes(script),
    pythonRestatingDocstringRecipe,
    pythonDependenciesRecipe,
  ]);
}

export const PYTHON_RECIPES = createPythonRecipes({
  runScript: localRunScript,
  optionsFor: () => ({}),
});
