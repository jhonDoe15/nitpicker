import { existsSync, readFileSync } from 'node:fs';
import { containedPath } from '../../../../../core/fix/common/contained-path.mjs';
import { useGitFixtures } from '../../test-support/git-fixtures.mts';
import { runRecipes } from '../../../../../core/fix/engine/run-recipes.mjs';
import { scriptRecipes } from '../python-recipes.mjs';
import { localRunScript } from '../script-edits.mjs';

const { createGitRepository } = useGitFixtures();

const SCRIPT_RECIPES = scriptRecipes({ runScript: localRunScript, optionsFor: () => ({}) });

type RecipeOptions = { selectedRules?: readonly string[]; recipes?: readonly unknown[] };

type AppliedRecipes = {
  outcome: ReturnType<typeof runRecipes>;
  exists: (name: string) => boolean;
  read: (name: string) => string;
};

export function applyRecipes(
  files: Readonly<Record<string, string>>,
  options: RecipeOptions = {},
): AppliedRecipes {
  const { selectedRules = [], recipes = SCRIPT_RECIPES } = options;
  const { root: projectRoot } = createGitRepository(files, { prefix: 'nitpicker-python-recipes-' });
  const outcome = runRecipes({
    projectRoot,
    files: Object.keys(files).map((name) => ({ path: name })),
    recipes,
    preset: 'python',
    selectedRules,
    accepts: (name: string) => name.endsWith('.py'),
    inputs: undefined,
  });
  return {
    outcome,
    exists: (name: string) => existsSync(containedPath(projectRoot, name)),
    read: (name: string) => readFileSync(containedPath(projectRoot, name), 'utf8'),
  };
}
