import { globMatcher, resolveLayoutFor } from '../types/typed-views.mts';
import { exceptionEntries, skippedFoldersOf } from '../types/config-readers.mts';
import type { ExceptionEntry, PolicyConfig, PolicyScope } from '../types/policy-types.mts';
import { isUnder, matcherOf } from '../policy-scope.mts';
import { duplicateFolderExclusions } from './duplicate-folders.mts';
import { globsCovering, subjectLabel, subjectsOf } from './exceptions/exception-scopes.mts';

const EXCLUSIONS = 'exclude and layout.excludedGlobs';

export type HidingSet = {
  readonly label: string;
  readonly kind: string;
  readonly importable: boolean;
  readonly hidesInHead: (file: string) => boolean;
  readonly baseHiders: (basePath: string) => ((file: string) => boolean)[];
  readonly establishedInBase?: (file: string) => boolean;
};

export function keyedExclusions(config: PolicyConfig): { glob: string; key: string }[] {
  const layout = resolveLayoutFor(config);
  const exclude = config.exclude ?? [];
  return layout.hiddenGlobs.map((glob) => ({
    glob,
    key: exclude.includes(glob) ? 'exclude' : 'layout.excludedGlobs',
  }));
}

export function testRootReclassifier(config: PolicyConfig): (file: string) => string | undefined {
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
          (root) => isUnder(file, root) && withoutRoot.get(root)?.isSourceFile(file) === true,
        );
}

function globSet(
  { label, kind }: { label: string; kind: string },
  [baseGlobs, headGlobs]: readonly [readonly string[], readonly string[]],
  importable: boolean,
): HidingSet {
  const base = baseGlobs.map((glob) => globMatcher(glob));
  const head = headGlobs.map((glob) => globMatcher(glob));
  return {
    label,
    kind,
    importable,
    hidesInHead: (file) => head.some((matcher) => matcher.test(file)),
    baseHiders: (basePath) =>
      base
        .filter((matcher) => matcher.test(basePath))
        .map((matcher) => (file) => matcher.test(file)),
  };
}

function exceptionSets(
  label: string,
  [baseExceptions, headExceptions]: readonly [
    readonly ExceptionEntry[] | undefined,
    readonly ExceptionEntry[] | undefined,
  ],
): HidingSet[] {
  return subjectsOf(headExceptions).map((subject) =>
    globSet(
      { label: `${label} for ${subjectLabel(subject)}`, kind: 'hidden-exception' },
      [globsCovering(baseExceptions, subject), subject.paths],
      false,
    ),
  );
}

function testRootSet(baseConfig: PolicyConfig, headConfig: PolicyConfig): HidingSet {
  const base = testRootReclassifier(baseConfig);
  const head = testRootReclassifier(headConfig);
  return {
    label: 'layout.testRoots',
    kind: 'hidden-test-root',
    importable: true,
    hidesInHead: (file) => head(file) !== undefined,
    baseHiders: (basePath) => {
      const root = base(basePath);
      return root === undefined ? [] : [(file) => base(file) === root];
    },
  };
}

function duplicateFolderSet(baseConfig: PolicyConfig, headConfig: PolicyConfig): HidingSet {
  const baseEntries = duplicateFolderExclusions(baseConfig, headConfig.preset ?? 'typescript');
  const headEntries = duplicateFolderExclusions(headConfig, headConfig.preset ?? 'typescript');
  const base = baseEntries.map(({ glob }) => glob);
  const head = headEntries.map(({ glob }) => glob);
  const established = baseEntries.filter(
    ({ permanent }) => permanent || skippedFoldersOf(baseConfig) === undefined,
  );
  return {
    ...globSet(
      { label: 'duplicates.skippedFolders', kind: 'hidden-duplicates' },
      [base, head],
      false,
    ),
    establishedInBase: matcherOf(established.map(({ glob }) => glob)),
  };
}

export function hidingSets(
  baseConfig: PolicyConfig,
  headConfig: PolicyConfig,
  scope: PolicyScope,
): HidingSet[] {
  return [
    globSet(
      { label: EXCLUSIONS, kind: 'hidden-exclusion' },
      [
        keyedExclusions(baseConfig).map(({ glob }) => glob),
        keyedExclusions(headConfig).map(({ glob }) => glob),
      ],
      true,
    ),
    duplicateFolderSet(baseConfig, headConfig),
    ...exceptionSets('exceptions', [
      exceptionEntries(baseConfig.exceptions),
      exceptionEntries(headConfig.exceptions),
    ]),
    ...exceptionSets('python.exceptions', [
      exceptionEntries(baseConfig.python?.exceptions),
      exceptionEntries(headConfig.python?.exceptions),
    ]),
    ...(scope.usesLayout ? [testRootSet(baseConfig, headConfig)] : []),
  ];
}
