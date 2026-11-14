import { defineRecipes } from '../../../../core/fix/engine/recipes.mjs';
import { localRunScript } from '../source/script-edits.mjs';
import { scriptRecipes } from '../source/python-recipes.mjs';
import { pythonDependenciesRecipe } from './dependencies/dependency-recipe.mjs';
import { pythonRestatingDocstringRecipe } from './restating-docstring.mjs';

export function createPythonRecipes(script) {
  return defineRecipes([
    ...scriptRecipes(script),
    pythonRestatingDocstringRecipe,
    pythonDependenciesRecipe,
  ]);
}

export const PYTHON_RECIPES = createPythonRecipes({
  runScript: localRunScript,
  optionsFor: () => ({}),
});
