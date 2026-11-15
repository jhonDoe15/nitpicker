import { testFileCandidates } from '../files.mjs';
import { suggestedByLayout } from './layout.mjs';
import { withProjectIndex } from './project-tests.mjs';
import { testImports, testReferencing } from './references.mjs';
import { testThroughImports } from './scripts/import-chains.mjs';
import { languageOf } from '../source.mjs';

function suggestion(file, env) {
  const flat = suggestedByLayout(file, env);
  if (flat === undefined) {
    return undefined;
  }
  if (!env.exists(flat) || testImports(flat, file, env)) {
    return { path: flat, exists: env.exists(flat) };
  }
  const mirrored = suggestedByLayout(file, env, { mirror: true });
  return { path: mirrored, exists: env.exists(mirrored) };
}

function indirectTest(file, env, symbol) {
  return languageOf(file) === 'typescript' ? testThroughImports(file, env, symbol) : undefined;
}

export function findTestFile(file, project, symbol) {
  const env = project.index === undefined ? withProjectIndex(project) : project;
  const candidates = testFileCandidates(file);
  const conventional = candidates.find((candidate) => env.exists(candidate));
  if (conventional !== undefined) {
    return { path: conventional, exists: true };
  }
  const referencing = testReferencing(file, env, symbol) ?? indirectTest(file, env, symbol);
  if (referencing !== undefined) {
    return { path: referencing, exists: true };
  }
  const suggested = suggestion(file, env);
  if (suggested !== undefined) {
    return suggested;
  }
  return candidates.length === 0 ? undefined : { path: candidates[0], exists: false };
}
