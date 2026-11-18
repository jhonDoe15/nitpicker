import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { writeFiles } from '../../../../core/diff/git/test-support/fixture-files.mts';
import { recipeSpecs, runRecipes } from '../../../../core/fix/test-support/engine-views.mts';
import type { RunResult } from '../../../../core/fix/test-support/engine-views.mts';
import { callUntyped, findingsOf } from '../../adapters/typed/java-values.mts';
import type { JavaFinding } from '../../adapters/typed/java-values.mts';
import { readSpringConfigFindings } from '../../adapters/spring/java-spring.mts';
import { JVM_RECIPES } from '../recipes/jvm-recipes.mts';

const ACCEPTED = /\.(?:java|kt|properties|ya?ml)$/u;
const SOURCE_ROOTS = ['src/main/java', 'src/main/kotlin'];

type SpringFixOptions = {
  readonly files: Readonly<Record<string, string>>;
  readonly changed?: readonly string[];
  readonly rule: string;
  readonly preset?: string;
};

type SpringFixProject = {
  readonly result: RunResult;
  readonly read: (name: string) => string;
  readonly remaining: (ruleName: string) => JavaFinding[];
};

function contained(root: string, name: string): string {
  const full = path.resolve(root, name);
  if (!full.startsWith(root + path.sep)) {
    throw new Error(`${name} is outside ${root}`);
  }
  return full;
}

export function springFix({
  files,
  changed = Object.keys(files),
  rule,
  preset = 'java',
}: SpringFixOptions): SpringFixProject {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-spring-fix-'));
  writeFiles(root, files);
  const result = runRecipes({
    projectRoot: root,
    files: changed.map((name) => ({ path: name })),
    recipes: recipeSpecs(JVM_RECIPES),
    preset,
    selectedRules: [`spring/${rule}`],
    accepts: (name) => ACCEPTED.test(name),
    inputs: undefined,
  });
  return {
    result,
    read: (name) => readFileSync(contained(root, name), 'utf8'),
    remaining: (ruleName) =>
      findingsOf(callUntyped(readSpringConfigFindings, root, { sourceRoots: SOURCE_ROOTS })).filter(
        (finding) => finding.rule === ruleName,
      ),
  };
}
