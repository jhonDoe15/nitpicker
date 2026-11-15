import path from 'node:path';
import { languageOf } from '../source.mjs';
import { isTestFile, memoized, projectFiles, textOf } from './project-tests.mjs';
import { exportedNames, importsOf, isScript, reExportsOf } from './scripts/script-imports.mjs';
import { jvmTest, jvmTestImports } from './others/jvm-references.mjs';
import { pythonTest, pythonImports } from './others/python-references.mjs';

const FOLDERS_UP = 3;

function ancestors(file) {
  const dir = path.posix.dirname(file);
  if (dir === '.') {
    return [];
  }
  const parts = dir.split('/');
  return parts.map((_, drop) => parts.slice(0, parts.length - drop).join('/')).slice(0, FOLDERS_UP);
}

function neighbours(file, env) {
  const folders = new Set(ancestors(file));
  return projectFiles(env).files.filter(
    (name) =>
      folders.has(path.posix.dirname(name)) && name !== file && isScript(name) && !isTestFile(name),
  );
}

function barrelsOf(file, env) {
  return memoized(env, `barrels:${file}`, () => {
    const candidates = neighbours(file, env);
    const order = [file];
    const seen = new Set(order);
    for (const current of order) {
      const next = candidates.filter(
        (name) => !seen.has(name) && reExportsOf(env, name).some((entry) => entry.file === current),
      );
      for (const name of next) {
        seen.add(name);
        order.push(name);
      }
    }
    return order;
  });
}

function reachRank(test, file, env) {
  const reached = barrelsOf(file, env);
  const own = exportedNames(env, file);
  const ranks = importsOf(env, test)
    .map((entry) => ({ rank: reached.indexOf(entry.file), entry }))
    .filter(({ rank, entry }) => {
      if (rank === -1) {
        return false;
      }
      return rank === 0 || entry.names === undefined || entry.names.some((name) => own.has(name));
    })
    .map(({ rank }) => rank);
  return ranks.length === 0 ? -1 : Math.min(...ranks);
}

function isBetter(a, b) {
  return a.rank < b.rank || (a.rank === b.rank && a.test < b.test);
}

function scriptTest(file, env) {
  return projectFiles(env)
    .tests.filter((test) => isScript(test))
    .map((test) => ({ test, rank: reachRank(test, file, env) }))
    .filter(({ rank }) => rank !== -1)
    .reduce(
      (best, found) => (best === undefined || isBetter(found, best) ? found : best),
      undefined,
    )?.test;
}

function goTest(file, env) {
  const folder = path.posix.dirname(file);
  return projectFiles(env).tests.find(
    (test) => path.posix.dirname(test) === folder && languageOf(test) === 'go',
  );
}

const FINDERS = {
  typescript: scriptTest,
  python: pythonTest,
  java: jvmTest,
  kotlin: jvmTest,
  go: goTest,
};

export function testReferencing(file, env) {
  const language = languageOf(file);
  return language === undefined || isTestFile(file) ? undefined : FINDERS[language](file, env);
}

export function testImports(test, file, env) {
  const language = languageOf(file);
  if (language === 'typescript') {
    return isScript(test) && reachRank(test, file, env) !== -1;
  }
  if (language === 'python') {
    return pythonImports(file, textOf(env, test));
  }
  return jvmTestImports(file, test, env);
}
