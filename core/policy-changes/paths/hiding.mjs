import { globMatcher } from '../../../shared/paths/glob.mjs';
import { resolveLayoutFor } from '../../../languages/typescript/preset/layout.mjs';
import { isUnder, matcherOf } from '../policy-scope.mjs';
import { duplicateFolderExclusions } from './duplicate-folders.mjs';
import { globsCovering, subjectLabel, subjectsOf } from './exceptions/exception-scopes.mjs';

const EXCLUSIONS = 'exclude and layout.excludedGlobs';

export function keyedExclusions(config) {
  const layout = resolveLayoutFor(config);
  const exclude = config.exclude ?? [];
  return layout.hiddenGlobs.map((glob) => ({
    glob,
    key: exclude.includes(glob) ? 'exclude' : 'layout.excludedGlobs',
  }));
}

export function testRootReclassifier(config) {
  const layout = resolveLayoutFor(config);
  const withoutRoot = new Map(
    layout.testRoots.map((root) => [
      root,
      resolveLayoutFor({
        ...config,
        layout: { ...config.layout, testRoots: layout.testRoots.filter((other) => other !== root) },
      }),
    ]),
  );
  return (file) =>
    layout.isSourceFile(file)
      ? undefined
      : layout.testRoots.find(
          (root) => isUnder(file, root) && withoutRoot.get(root).isSourceFile(file),
        );
}

function globSet(label, [baseGlobs, headGlobs], importable) {
  const base = baseGlobs.map((glob) => globMatcher(glob));
  const head = headGlobs.map((glob) => globMatcher(glob));
  return {
    label,
    importable,
    hidesInHead: (file) => head.some((matcher) => matcher.test(file)),
    baseHiders: (basePath) =>
      base
        .filter((matcher) => matcher.test(basePath))
        .map((matcher) => (file) => matcher.test(file)),
  };
}

function exceptionSets(label, [baseExceptions, headExceptions]) {
  return subjectsOf(headExceptions).map((subject) =>
    globSet(
      `${label} for ${subjectLabel(subject)}`,
      [globsCovering(baseExceptions, subject), subject.paths],
      false,
    ),
  );
}

function testRootSet(baseConfig, headConfig) {
  const base = testRootReclassifier(baseConfig);
  const head = testRootReclassifier(headConfig);
  return {
    label: 'layout.testRoots',
    importable: true,
    hidesInHead: (file) => head(file) !== undefined,
    baseHiders: (basePath) => {
      const root = base(basePath);
      return root === undefined ? [] : [(file) => base(file) === root];
    },
  };
}

function duplicateFolderSet(baseConfig, headConfig) {
  const [baseEntries, headEntries] = [baseConfig, headConfig].map((config) =>
    duplicateFolderExclusions(config, headConfig.preset ?? 'typescript'),
  );
  const base = baseEntries.map(({ glob }) => glob);
  const head = headEntries.map(({ glob }) => glob);
  const established = baseEntries.filter(
    ({ permanent }) => permanent || baseConfig.duplicates?.skippedFolders === undefined,
  );
  return {
    ...globSet('duplicates.skippedFolders', [base, head], false),
    establishedInBase: matcherOf(established.map(({ glob }) => glob)),
  };
}

export function hidingSets(baseConfig, headConfig, scope) {
  return [
    globSet(
      EXCLUSIONS,
      [keyedExclusions(baseConfig), keyedExclusions(headConfig)].map((entries) =>
        entries.map(({ glob }) => glob),
      ),
      true,
    ),
    duplicateFolderSet(baseConfig, headConfig),
    ...exceptionSets('exceptions', [baseConfig.exceptions, headConfig.exceptions]),
    ...exceptionSets('python.exceptions', [
      baseConfig.python?.exceptions,
      headConfig.python?.exceptions,
    ]),
    ...(scope.usesLayout ? [testRootSet(baseConfig, headConfig)] : []),
  ];
}
