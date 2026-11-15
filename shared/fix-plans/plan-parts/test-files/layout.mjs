import path from 'node:path';
import { extensionOf, languageOf } from '../source.mjs';
import { projectFiles, testRootOf } from './project-tests.mjs';

const SOURCE_ROOT = /^src(?:\/main)?(?:\/|$)/u;
const TEST_EXTENSION = { tsx: 'ts', jsx: 'js' };

function isAncestor(folder, file) {
  return folder === '' || file.startsWith(`${folder}/`);
}

function parentOf(root) {
  const parent = path.posix.dirname(root);
  return parent === '.' ? '' : parent;
}

function countBy(items, keyOf) {
  const counts = new Map();
  for (const item of items) {
    counts.set(keyOf(item), (counts.get(keyOf(item)) ?? 0) + 1);
  }
  return counts;
}

function chosenRoot(tests, file) {
  const counts = countBy(
    tests.map(testRootOf).filter((root) => root !== undefined),
    (root) => root,
  );
  const usable = [...counts.keys()].filter((root) => isAncestor(parentOf(root), file));
  const ranked = usable.toSorted(
    (a, b) =>
      parentOf(b).length - parentOf(a).length ||
      counts.get(b) - counts.get(a) ||
      a.localeCompare(b),
  );
  return ranked[0];
}

function infixOf(tests) {
  const specs = tests.filter((test) => /\.spec\.[^.]+$/u.test(test)).length;
  return specs > tests.length - specs ? 'spec' : 'test';
}

function nestedFolder(root, relative, tests) {
  const mirrored = path.posix.join(root, relative);
  const folders = new Set(tests.map((test) => path.posix.dirname(test)));
  if (folders.has(mirrored)) {
    return mirrored;
  }
  const named = relative
    .split('/')
    .map((segment) => path.posix.join(root, segment))
    .find((folder) => folders.has(folder));
  return named ?? mirrored;
}

function placed(file, { root, tests, mirror }) {
  const { dir, name } = path.posix.parse(file);
  const language = languageOf(file);
  const nested =
    mirror || tests.some((test) => testRootOf(test) === root && path.posix.dirname(test) !== root);
  const relative = dir.slice(parentOf(root).length).replace(/^\//u, '').replace(SOURCE_ROOT, '');
  const folder = nested ? nestedFolder(root, relative, tests) : root;
  if (language === 'python') {
    return path.posix.join(folder, `test_${name}.py`);
  }
  const extension = TEST_EXTENSION[extensionOf(file)] ?? extensionOf(file);
  return path.posix.join(folder, `${name}.${infixOf(tests)}.${extension}`);
}

export function suggestedByLayout(file, env, { mirror = false } = {}) {
  const language = languageOf(file);
  if (language !== 'typescript' && language !== 'python') {
    return undefined;
  }
  const tests = projectFiles(env).tests.filter((test) => languageOf(test) === language);
  const root = chosenRoot(tests, file);
  const inRoots = tests.filter((test) => testRootOf(test) !== undefined).length;
  return root === undefined || inRoots <= tests.length - inRoots
    ? undefined
    : placed(file, { root, tests, mirror });
}
