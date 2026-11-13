import { existsSync, readFileSync } from 'node:fs';
import { containedPath } from '../../../../../core/fix/common/contained-path.mjs';
import { useGitFixtures } from '../../../../../core/diff/git/test-support/git-repository.mjs';
import { runRecipes } from '../../../../../core/fix/engine/run-recipes.mjs';
import { scriptRecipes } from '../python-recipes.mjs';
import { localRunScript } from '../script-edits.mjs';

const { createGitRepository } = useGitFixtures();

const SCRIPT_RECIPES = scriptRecipes({ runScript: localRunScript, optionsFor: () => ({}) });

export function applyRecipes(files, { selectedRules = [], recipes = SCRIPT_RECIPES } = {}) {
  const { root: projectRoot } = createGitRepository(files, { prefix: 'nitpicker-python-recipes-' });
  const outcome = runRecipes({
    projectRoot,
    files: Object.keys(files).map((name) => ({ path: name })),
    recipes,
    preset: 'python',
    selectedRules,
    accepts: (name) => name.endsWith('.py'),
  });
  return {
    outcome,
    exists: (name) => existsSync(containedPath(projectRoot, name)),
    read: (name) => readFileSync(containedPath(projectRoot, name), 'utf8'),
  };
}
