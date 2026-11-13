import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathInside } from '../../../../shared/filesystem.mjs';
import { byCodeUnits, listedProjectFiles } from '../../../../core/scope/mutation-scope.mjs';
import { isJvmProductionPath, isJvmTestPath } from './jvm-paths.mts';
import type { ChangedTests, ComparisonRoots } from './comparison-changes.mts';
import { fieldOf, textsOf } from '../../../../shared/values/readers.mts';

type ProductionIndex = {
  readonly root: string;
  readonly byName: Map<string, string[]>;
  readonly packages: Map<string, string>;
};
type Imports = { readonly types: Set<string>; readonly packages: Set<string> };
type TestedSources = { readonly sources: string[]; readonly capped: string[] };
type ChangedTestsRequest = {
  readonly touchedPaths: readonly string[];
  readonly headRoot: string;
  readonly quick?: unknown;
};

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

function sourcePath(root: string, file: string): string | undefined {
  const full: unknown = pathInside(root, file);
  return typeof full === 'string' ? full : undefined;
}

function readText(root: string, file: string): string | undefined {
  const full = sourcePath(root, file);
  try {
    return full === undefined ? undefined : readFileSync(full, 'utf8').replace(/^﻿/u, '');
  } catch (error) {
    if (fieldOf(error, 'code') === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
}

function packageOf(text: string): string {
  return PACKAGE.exec(text)?.[1]?.replaceAll('`', '') ?? '';
}

function importsOf(text: string): Imports {
  const types = new Set<string>();
  const packages = new Set<string>();
  for (const [, isStatic, rawName = '', wildcard] of text.matchAll(IMPORT)) {
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

function namesInOrder(testPath: string, text: string): string[] {
  const code = text.replaceAll(NOT_CODE, ' ').replaceAll(HEADER_LINE, ' ');
  const own = path.posix.basename(testPath).replace(/\.\w+$/u, '');
  return [...new Set([own.replaceAll(TEST_AFFIXES, ''), ...(code.match(IDENTIFIER) ?? [])])];
}

function productionIndex(root: string): ProductionIndex {
  const byName = new Map<string, string[]>();
  for (const file of textsOf(listedProjectFiles(root, JVM_FILES)).filter(isJvmProductionPath)) {
    const name = path.posix.basename(file).replace(/\.\w+$/u, '');
    byName.set(name, [...(byName.get(name) ?? []), file]);
  }
  return { root, byName, packages: new Map() };
}

function packageOfFile(index: ProductionIndex, file: string): string {
  const known = index.packages.get(file);
  if (known !== undefined) {
    return known;
  }
  const owner = packageOf(readText(index.root, file) ?? '');
  index.packages.set(file, owner);
  return owner;
}

function referencedSources(index: ProductionIndex, testPath: string): string[] {
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

function reachedFrom(root: string, tests: readonly string[]): string[] {
  if (tests.length === 0) {
    return [];
  }
  const index = productionIndex(root);
  return tests.toSorted(byCodeUnits).flatMap((test) => referencedSources(index, test));
}

export function testedSources(tests: ChangedTests, roots: ComparisonRoots): TestedSources {
  const reached = [
    ...new Set([...reachedFrom(roots.head, tests.head), ...reachedFrom(roots.base, tests.base)]),
  ];
  return {
    sources: reached.slice(0, MAX_TESTED_SOURCES),
    capped: reached.slice(MAX_TESTED_SOURCES),
  };
}

function contentDigest(root: string, file: string): string {
  const full = sourcePath(root, file);
  return full === undefined || !existsSync(full)
    ? 'absent'
    : createHash('sha256').update(readFileSync(full)).digest('hex');
}

export function changedTestsKey({
  touchedPaths,
  headRoot,
  quick,
}: ChangedTestsRequest): string | undefined {
  const tests = touchedPaths.filter(isJvmTestPath).toSorted(byCodeUnits);
  if (quick === true) {
    return undefined;
  }
  const digests = tests.map((file): [string, string] => [file, contentDigest(headRoot, file)]);
  const onHead = digests.filter(([, digest]) => digest !== 'absent').map(([file]) => file);
  return JSON.stringify({ tests: digests, reached: reachedFrom(headRoot, onHead) });
}
