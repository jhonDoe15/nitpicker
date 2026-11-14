import { testFileCandidates } from '../files.mjs';
import { suggestedByLayout } from './layout.mjs';
import { withProjectIndex } from './project-tests.mjs';
import { testImports, testReferencing } from './references.mjs';

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

export function findTestFile(file, project) {
  const env = project.index === undefined ? withProjectIndex(project) : project;
  const candidates = testFileCandidates(file);
  const conventional = candidates.find((candidate) => env.exists(candidate));
  if (conventional !== undefined) {
    return { path: conventional, exists: true };
  }
  const referencing = testReferencing(file, env);
  if (referencing !== undefined) {
    return { path: referencing, exists: true };
  }
  const suggested = suggestion(file, env);
  if (suggested !== undefined) {
    return suggested;
  }
  return candidates.length === 0 ? undefined : { path: candidates[0], exists: false };
}
