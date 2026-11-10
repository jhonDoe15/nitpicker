import { readFileSync } from 'node:fs';
import path from 'node:path';
import { globMatcher } from '../../../../../shared/paths/glob.mjs';
import {
  copiedConstantMessage,
  valueKey,
} from '../../../../../shared/rules/copied-constants/copied-constants.mjs';
import { findingFactory } from '../../kotlin/review-rules/review-finding.mjs';
import { readJvmDefinitions } from '../../reuse/source/jvm-definitions.mjs';
import { pathInside, sourceFilesUnder } from '../java-sources.mjs';
import { mainConstants } from './jvm-constants.mjs';
import { testLiterals } from './test-literals.mjs';

export const COPIED_CONSTANT_RULE = 'CopiedConstantInTest';
export const COPIED_CONSTANT_EXCEPTION_RULE = `pmd/${COPIED_CONSTANT_RULE}`;
export const COPIED_CONSTANT_PIN = 'assertEquals({value}, {name})';
const OUTSIDE_SOURCES = /^\.\.(?:\/|$)|(?:^|\/)build(?:\/|$)/u;
const NOTHING_SKIPPED = new Set();

function rootsOf(project, { kotlin, test }) {
  const java = test ? project.testSourceRoots : project.sourceRoots;
  const kotlinRoots = test ? project.kotlinTestSourceRoots : project.kotlinSourceRoots;
  return [...(java ?? []), ...(kotlin ? (kotlinRoots ?? []) : [])].filter(
    (root) => root !== '' && !OUTSIDE_SOURCES.test(root),
  );
}

function parsedSources(projectRoot, roots, { kotlin, excluded }) {
  const extensions = kotlin ? ['.java', '.kt'] : ['.java'];
  const files = [...new Set(roots)]
    .flatMap((root) => sourceFilesUnder(pathInside(projectRoot, root), extensions, NOTHING_SKIPPED))
    .map((full) => path.relative(projectRoot, full).replaceAll('\\', '/'))
    .filter((file) => !excluded.some((matcher) => matcher.test(file)));
  return [...new Set(files)].map((file) => ({
    file,
    kotlin: file.endsWith('.kt'),
    parsed: readJvmDefinitions(readFileSync(pathInside(projectRoot, file), 'utf8'), {
      kotlin: file.endsWith('.kt'),
    }),
  }));
}

function imported(imports, target) {
  return imports.some(({ path: name, wildcard }) => !wildcard && name === target);
}

function onDemand(imports, owner) {
  return imports.some(({ path: name, wildcard }) => wildcard && name === owner);
}

function ownerNames(test, constant) {
  const qualified = `${constant.packageName}.${constant.owner}`;
  const aliases = test.parsed.imports
    .filter(({ path: name, alias }) => alias !== undefined && name === qualified)
    .map(({ alias }) => alias);
  const visible =
    test.parsed.packageName === constant.packageName ||
    imported(test.parsed.imports, qualified) ||
    onDemand(test.parsed.imports, constant.packageName);
  return [...(visible ? [constant.owner] : []), ...aliases];
}

function memberImport(test, constant, prefix) {
  return test.parsed.imports.find(
    ({ path: name, wildcard }) =>
      (!wildcard && name === `${prefix}.${constant.name}`) || (wildcard && name === prefix),
  );
}

function sees(test, constant, identifiers) {
  if (constant.owner === undefined) {
    if (!test.kotlin) {
      return undefined;
    }
    const direct = memberImport(test, constant, constant.packageName);
    const samePackage = test.parsed.packageName === constant.packageName;
    return samePackage || direct !== undefined
      ? [constant.name, direct?.alias].filter(Boolean)
      : undefined;
  }
  const member = memberImport(test, constant, `${constant.packageName}.${constant.owner}`);
  if (member !== undefined) {
    return [constant.name, member.alias].filter(Boolean);
  }
  const owners = ownerNames(test, constant).filter((name) => identifiers.has(name));
  return owners.length > 0 ? [constant.name] : undefined;
}

function visibleConstants(test, constants) {
  const identifiers = new Set(
    test.parsed.tokens
      .slice(test.parsed.headerEnd)
      .filter(({ kind }) => kind === 'identifier')
      .map(({ text }) => text),
  );
  const byValue = new Map();
  for (const constant of constants) {
    const mentions = sees(test, constant, identifiers);
    if (mentions !== undefined) {
      const key = valueKey(constant.value);
      byValue.set(key, [...(byValue.get(key) ?? []), { ...constant, mentions }]);
    }
  }
  return byValue;
}

function displayName(constant) {
  return constant.owner === undefined ? constant.name : `${constant.owner}.${constant.name}`;
}

function testFindings(test, constants) {
  const finding = findingFactory();
  const byValue = visibleConstants(test, constants);
  if (byValue.size === 0) {
    return [];
  }
  return testLiterals(test.parsed, { kotlin: test.kotlin }).flatMap((literal) => {
    const copied = byValue.get(valueKey(literal.value));
    if (copied === undefined) {
      return [];
    }
    const names = literal.names();
    if (copied.some(({ mentions }) => mentions.some((name) => names.has(name)))) {
      return [];
    }
    const sorted = copied.toSorted((left, right) =>
      displayName(left).localeCompare(displayName(right)),
    );
    const shown = [...new Set(sorted.map(displayName))];
    return [
      finding({
        rule: COPIED_CONSTANT_RULE,
        file: test.file,
        line: literal.line,
        symbol: shown[0],
        key: `${shown[0]}:${valueKey(literal.value)}`,
        message: copiedConstantMessage({
          names: shown,
          owner: [...new Set(sorted.map(({ file }) => file))].join(' and '),
          literal: literal.value,
          pin: COPIED_CONSTANT_PIN,
        }),
      }),
    ];
  });
}

/** The test literals that copy a constant of the main sources, over every module of the project. */
export function readCopiedConstantFindings(projectRoot, { projects, kotlin = false, policy = {} }) {
  const excluded = (policy.exclude ?? []).map((glob) => globMatcher(glob));
  const tests = parsedSources(
    projectRoot,
    projects.flatMap((project) => rootsOf(project, { kotlin, test: true })),
    { kotlin, excluded },
  );
  if (tests.length === 0) {
    return [];
  }
  const constants = mainConstants(
    parsedSources(
      projectRoot,
      projects.flatMap((project) => rootsOf(project, { kotlin, test: false })),
      { kotlin, excluded },
    ),
  );
  if (constants.length === 0) {
    return [];
  }
  return tests.flatMap((test) => testFindings(test, constants));
}
