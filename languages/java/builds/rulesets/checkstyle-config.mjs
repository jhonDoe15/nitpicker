import { readFileSync } from 'node:fs';
import path from 'node:path';
import { GRADLE_DIRECTORY } from '../java-build.mjs';

const TREE_WALKER = '<module name="TreeWalker">';
function checkstyleRuleModules(file) {
  const text = readFileSync(path.join(GRADLE_DIRECTORY, 'rules', path.basename(file)), 'utf8');
  return /<modules>([\s\S]*)<\/modules>/u.exec(text)[1];
}

export function withGuardChecks(config, files) {
  if (!config.includes(TREE_WALKER)) {
    throw new Error('nitpicker could not find TreeWalker in google_checks.xml');
  }
  const modules = files.map((file) => checkstyleRuleModules(file)).join('\n');
  return config.replace(TREE_WALKER, () => `${TREE_WALKER}\n${modules}`);
}
