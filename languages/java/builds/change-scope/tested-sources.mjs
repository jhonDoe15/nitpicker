import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathInside } from '../../../../shared/filesystem.mjs';
import { byCodeUnits, listedProjectFiles } from '../../../../core/scope/mutation-scope.mjs';
import { isJvmProductionPath, isJvmTestPath } from './jvm-paths.mjs';

export const MAX_TESTED_SOURCES = 10;
const JVM_FILES = ['*.java', '*.kt'];
const PACKAGE = /^\s*(?:@file:\S+\s+)*package\s+([\w.`]+)/mu;
const IMPORT =
  /^[ \t]*import[ \t]+(static[ \t]+)?([\w.`]+?)(\.\*)?(?:[ \t]+as[ \t]+\w+)?[ \t]*(?:;[ \t]*)?$/gmu;
const NOT_CODE =
  /\/\*[\s\S]*?\*\/|\/\/[^\n]*|"""[\s\S]*?"""|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'/gu;
const HEADER_LINE = /^\s*(?:package|import)\s[^\n]*$/gmu;
const IDENTIFIER = /[A-Za-z_$][\w$]*/gu;
const TEST_AFFIXES = /^Test(?=[A-Z])|(?:Tests?|IT|ITCase|Specs?)$/gu;

function readText(root, file) {
  const full = pathInside(root, file);
  try {
    return full === undefined ? undefined : readFileSync(full, 'utf8').replace(/^\uFEFF/u, '');
  } catch (error) {
    if (error.code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
}

function packageOf(text) {
  return PACKAGE.exec(text)?.[1].replaceAll('`', '') ?? '';
}

function importsOf(text) {
  const types = new Set();
  const packages = new Set();
  for (const [, isStatic, rawName, wildcard] of text.matchAll(IMPORT)) {
    const name = rawName.replaceAll('`', '');
    const owner = name.slice(0, Math.max(0, name.lastIndexOf('.')));
    if (wildcard !== undefined && isStatic === undefined) {
      packages.add(name);
    }
    types.add(name);
    types.add(owner);
  }
  return { types, packages };
}

function namesInOrder(testPath, text) {
  const code = text.replaceAll(NOT_CODE, ' ').replaceAll(HEADER_LINE, ' ');
  const own = path.posix.basename(testPath).replace(/\.\w+$/u, '');
  return [...new Set([own.replaceAll(TEST_AFFIXES, ''), ...(code.match(IDENTIFIER) ?? [])])];
}

function productionIndex(root) {
  const byName = new Map();
  for (const file of listedProjectFiles(root, JVM_FILES).filter(isJvmProductionPath)) {
    const name = path.posix.basename(file).replace(/\.\w+$/u, '');
    byName.set(name, [...(byName.get(name) ?? []), file]);
  }
  return { root, byName, packages: new Map() };
}

function packageOfFile(index, file) {
  if (!index.packages.has(file)) {
    index.packages.set(file, packageOf(readText(index.root, file) ?? ''));
  }
  return index.packages.get(file);
}

function referencedSources(index, testPath) {
  const text = readText(index.root, testPath);
  if (text === undefined) {
    return [];
  }
  const own = packageOf(text);
  const { types, packages } = importsOf(text);
  return namesInOrder(testPath, text).flatMap((name) =>
    (index.byName.get(name) ?? []).filter((file) => {
      const owner = packageOfFile(index, file);
      return owner === own || packages.has(owner) || types.has(`${owner}.${name}`);
    }),
  );
}

function reachedFrom(root, tests) {
  if (tests.length === 0) {
    return [];
  }
  const index = productionIndex(root);
  return tests.toSorted(byCodeUnits).flatMap((test) => referencedSources(index, test));
}

export function testedSources(tests, roots) {
  const reached = [
    ...new Set([...reachedFrom(roots.head, tests.head), ...reachedFrom(roots.base, tests.base)]),
  ];
  return {
    sources: reached.slice(0, MAX_TESTED_SOURCES),
    capped: reached.slice(MAX_TESTED_SOURCES),
  };
}

function contentDigest(root, file) {
  const full = pathInside(root, file);
  return full === undefined || !existsSync(full)
    ? 'absent'
    : createHash('sha256').update(readFileSync(full)).digest('hex');
}

export function changedTestsKey({ touchedPaths, headRoot, quick }) {
  const tests = touchedPaths.filter(isJvmTestPath).toSorted(byCodeUnits);
  if (quick) {
    return undefined;
  }
  const digests = tests.map((file) => [file, contentDigest(headRoot, file)]);
  const onHead = digests.filter(([, digest]) => digest !== 'absent').map(([file]) => file);
  return JSON.stringify({ tests: digests, reached: reachedFrom(headRoot, onHead) });
}
