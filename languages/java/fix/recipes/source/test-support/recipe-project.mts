import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { insideProject } from '../../../../../../core/init/support/inside-project.mts';
import { writeFiles } from '../../../../../../core/diff/git/test-support/fixture-files.mts';
import {
  recipeSpecs,
  runRecipes,
  type RunResult,
} from '../../../../../../core/fix/test-support/engine-views.mts';
import { JVM_RECIPES } from '../../jvm-recipes.mts';

type Options = {
  readonly files: Readonly<Record<string, string>>;
  readonly rule: string;
  readonly changed?: readonly string[];
  readonly accepted?: RegExp;
};
export type RecipeProject = {
  readonly result: RunResult;
  readonly read: (name: string) => string;
  readonly exists: (name: string) => boolean;
};

const SOURCES = /\.(?:java|kt)$/u;

export function recipeProject({
  files,
  rule,
  changed = Object.keys(files).filter((name) => SOURCES.test(name)),
  accepted = SOURCES,
}: Options): RecipeProject {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-java-recipe-'));
  writeFiles(root, files);
  const result = runRecipes({
    projectRoot: root,
    files: changed.map((name) => ({ path: name })),
    recipes: recipeSpecs(JVM_RECIPES),
    preset: 'java',
    selectedRules: [rule],
    accepts: (name) => accepted.test(name),
    inputs: undefined,
  });
  return {
    result,
    read: (name) => readFileSync(insideProject(root, name), 'utf8'),
    exists: (name) => existsSync(insideProject(root, name)),
  };
}
