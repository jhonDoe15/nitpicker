import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { writeFiles } from '../../../../core/diff/git/test-support/fixture-files.mjs';
import { runRecipes } from '../../../../core/fix/engine/run-recipes.mjs';
import { readSpringConfigFindings } from '../../adapters/spring/java-spring.mjs';
import { JVM_RECIPES } from '../recipes/jvm-recipes.mjs';

const ACCEPTED = /\.(?:java|kt|properties|ya?ml)$/u;
const SOURCE_ROOTS = ['src/main/java', 'src/main/kotlin'];

function contained(root, name) {
  const full = path.resolve(root, name);
  if (!full.startsWith(root + path.sep)) {
    throw new Error(`${name} is outside ${root}`);
  }
  return full;
}

export function springFix({ files, changed = Object.keys(files), rule, preset = 'java' }) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-spring-fix-'));
  writeFiles(root, files);
  const result = runRecipes({
    projectRoot: root,
    files: changed.map((name) => ({ path: name })),
    recipes: JVM_RECIPES,
    preset,
    selectedRules: [`spring/${rule}`],
    accepts: (name) => ACCEPTED.test(name),
  });
  return {
    result,
    read: (name) => readFileSync(contained(root, name), 'utf8'),
    remaining: (ruleName) =>
      readSpringConfigFindings(root, { sourceRoots: SOURCE_ROOTS }).filter(
        (finding) => finding.rule === ruleName,
      ),
  };
}
