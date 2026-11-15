import { CONFIG_FILE_NAME } from '../../../shared/config.mjs';
import { resolveLayoutFor } from '../types/typed-views.mts';
import { exceptionEntries } from '../types/config-readers.mts';
import type {
  ChangePart,
  ExceptionEntry,
  PolicyConfig,
  PolicyScope,
} from '../types/policy-types.mts';
import { isUnder, matcherOf } from '../policy-scope.mts';
import {
  globsCovering,
  globsOfSubject,
  subjectLabel,
  subjectsOf,
} from './exceptions/exception-scopes.mts';
import { keyedExclusions, testRootReclassifier } from './hiding.mts';
import { duplicateFolderExclusions } from './duplicate-folders.mts';

const NOTHING_NEW = 'covers no checked file it did not cover before';

function newlyCovered(
  baseGlobs: readonly string[],
  headGlob: string,
  {
    paths,
    basePathOf = (file) => file,
  }: {
    readonly paths: readonly string[];
    readonly basePathOf?: (file: string) => string;
  },
): string[] {
  const before = matcherOf(baseGlobs);
  const after = matcherOf([headGlob]);
  return paths.filter((file) => after(file) && !before(basePathOf(file)));
}

function addedGlob(
  { text, kind }: { readonly text: string; readonly kind: string },
  covered: readonly string[],
  scope: PolicyScope,
): ChangePart {
  const code = new Set(scope.code);
  return covered.length === 0
    ? { loosened: [], changed: [`${text} (${NOTHING_NEW})`] }
    : {
        loosened: [
          { text, kind, files: [CONFIG_FILE_NAME, ...covered.filter((file) => code.has(file))] },
        ],
        changed: [],
      };
}

function exclusionChanges(
  baseConfig: PolicyConfig,
  headConfig: PolicyConfig,
  scope: PolicyScope,
): ChangePart[] {
  return [keyedExclusions, duplicateFolderExclusions].flatMap((exclusions) =>
    exclusionChangesOf(
      exclusions(baseConfig, headConfig.preset ?? 'typescript'),
      exclusions(headConfig),
      scope,
    ),
  );
}

function exclusionKind(key: string): string {
  return key === 'duplicates.skippedFolders' ? 'duplicates-scope' : 'exclusion';
}

type Exclusion = { readonly glob: string; readonly key: string };

function exclusionChangesOf(
  base: readonly Exclusion[],
  head: readonly Exclusion[],
  scope: PolicyScope,
): ChangePart[] {
  const baseGlobs = base.map(({ glob }) => glob);
  const keyOf = new Map(base.map(({ glob, key }) => [glob, key]));
  const headGlobs = new Set(head.map(({ glob }) => glob));
  return [
    ...head.map(({ glob, key }) => {
      if (!keyOf.has(glob)) {
        return addedGlob(
          { text: `${key} added: ${glob}`, kind: exclusionKind(key) },
          newlyCovered(baseGlobs, glob, { paths: scope.keptPaths }),
          scope,
        );
      }
      const moved =
        keyOf.get(glob) === key ? [] : [`${glob} moved from ${String(keyOf.get(glob))} to ${key}`];
      return { loosened: [], changed: moved };
    }),
    {
      loosened: [],
      changed: base
        .filter(({ glob }) => !headGlobs.has(glob))
        .map(({ glob, key }) => `${key} removed: ${glob}`),
    },
  ];
}

function exceptionChanges(
  baseExceptions: readonly ExceptionEntry[] = [],
  headExceptions: readonly ExceptionEntry[] = [],
  scope: PolicyScope,
): ChangePart[] {
  const added = headExceptions.map((entry) => {
    const { paths, reason } = entry;
    const rule = subjectLabel(entry);
    const before = globsCovering(baseExceptions, entry);
    const coverage = paths
      .filter((glob) => !before.includes(glob))
      .map((glob) => ({ glob, covered: newlyCovered(before, glob, { paths: scope.keptPaths }) }));
    const covering = coverage.filter(({ covered }) => covered.length > 0);
    const idle = coverage.filter(({ covered }) => covered.length === 0).map(({ glob }) => glob);
    return {
      loosened:
        covering.length === 0
          ? []
          : [
              {
                kind: 'exception',
                text: `exception added: ${rule} for ${covering.map(({ glob }) => glob).join(', ')} (${String(reason)})`,
                files: [
                  CONFIG_FILE_NAME,
                  ...new Set(
                    covering
                      .flatMap(({ covered }) => covered)
                      .filter((file) => scope.code.includes(file)),
                  ),
                ],
              },
            ],
      changed:
        idle.length === 0
          ? []
          : [`exception added: ${rule} for ${idle.join(', ')} (${NOTHING_NEW})`],
    };
  });
  const removed = subjectsOf(baseExceptions).flatMap((subject) => {
    const kept = globsOfSubject(headExceptions, subject);
    const dropped = subject.paths.filter((glob) => !kept.includes(glob));
    return dropped.length === 0
      ? []
      : [`exception removed: ${subjectLabel(subject)} for ${dropped.join(', ')}`];
  });
  return [...added, { loosened: [], changed: removed }];
}

const ENTRY_POINT_KEYS = ['layout', 'python'] as const;

function addedEntryPoints(baseConfig: PolicyConfig, headConfig: PolicyConfig, scope: PolicyScope) {
  return ENTRY_POINT_KEYS.flatMap((owner) => {
    const before = baseConfig[owner]?.entryPoints ?? [];
    return (headConfig[owner]?.entryPoints ?? [])
      .filter((glob) => !before.includes(glob))
      .map((glob) => ({
        key: `${owner}.entryPoints`,
        glob,
        covered: newlyCovered(before, glob, { paths: scope.code, basePathOf: scope.basePathOf }),
      }));
  });
}

function entryPointAddition(
  {
    key,
    glob,
    covered,
  }: { readonly key: string; readonly glob: string; readonly covered: readonly string[] },
  imported: ReadonlySet<string>,
): ChangePart {
  const text = `${key} added: ${glob}`;
  const importedFiles = covered.filter((file) => imported.has(file));
  return importedFiles.length === 0
    ? { loosened: [], changed: [text] }
    : {
        loosened: [
          {
            kind: 'imported-entry-point',
            text: `${text} (checked code imports ${importedFiles.join(', ')})`,
            files: [CONFIG_FILE_NAME, ...importedFiles],
          },
        ],
        changed: [],
      };
}

function entryPointChanges(
  baseConfig: PolicyConfig,
  headConfig: PolicyConfig,
  scope: PolicyScope,
): ChangePart[] {
  const added = addedEntryPoints(baseConfig, headConfig, scope);
  const imported = new Set(scope.importedBy([...new Set(added.flatMap(({ covered }) => covered))]));
  const removed = ENTRY_POINT_KEYS.flatMap((owner) => {
    const after = headConfig[owner]?.entryPoints ?? [];
    return (baseConfig[owner]?.entryPoints ?? [])
      .filter((glob) => !after.includes(glob))
      .map((glob) => `${owner}.entryPoints removed: ${glob}`);
  });
  return [
    ...added.map((entry) => entryPointAddition(entry, imported)),
    { loosened: [], changed: removed },
  ];
}

function rootRemovalKind(key: string): string {
  return key === 'layout.testRoots' ? 'test-root-removed' : 'source-root-removed';
}

function rootRemovals(scope: PolicyScope): ChangePart[] {
  const keys = Object.keys(scope.headRoots).filter((key) => key in scope.baseRoots);
  const removed = keys.flatMap((key) =>
    (scope.baseRoots[key] ?? [])
      .filter((root) => !(scope.headRoots[key] ?? []).includes(root))
      .map((root) => ({ key, root })),
  );
  function lost({ key, root }: { readonly key: string; readonly root: string }) {
    return scope.code.filter(
      (file) =>
        isUnder(file, root) && !(scope.headRoots[key] ?? []).some((kept) => isUnder(file, kept)),
    );
  }
  return removed.map((entry) => {
    const files = lost(entry);
    const text = `${entry.key} removed: ${entry.root}`;
    return files.length === 0
      ? { loosened: [], changed: [`${text} (no checked file was under it)`] }
      : {
          loosened: [
            { text, kind: rootRemovalKind(entry.key), files: [CONFIG_FILE_NAME, ...files] },
          ],
          changed: [],
        };
  });
}

function testRootAdditions(
  baseConfig: PolicyConfig,
  headConfig: PolicyConfig,
  scope: PolicyScope,
): ChangePart[] {
  if (!scope.usesLayout) {
    return [];
  }
  const base = resolveLayoutFor(baseConfig);
  const reclassifiedBy = testRootReclassifier(headConfig);
  const byRoot = Map.groupBy(
    scope.keptCode.filter((file) => base.isSourceFile(file)),
    (file) => reclassifiedBy(file) ?? '',
  );
  return [...byRoot]
    .filter(([root]) => root !== '' && !base.testRoots.includes(root))
    .map(([root, files]) => ({
      loosened: [
        {
          kind: 'test-root-added',
          text: `layout.testRoots added: ${root} (production code under it becomes test code)`,
          files: [CONFIG_FILE_NAME, ...files],
        },
      ],
      changed: [],
    }));
}

export function coveredPathChanges(
  baseConfig: PolicyConfig,
  headConfig: PolicyConfig,
  scope: PolicyScope,
): ChangePart[] {
  return [
    ...exclusionChanges(baseConfig, headConfig, scope),
    ...entryPointChanges(baseConfig, headConfig, scope),
    ...exceptionChanges(
      exceptionEntries(baseConfig.exceptions),
      exceptionEntries(headConfig.exceptions),
      scope,
    ),
    ...exceptionChanges(
      exceptionEntries(baseConfig.python?.exceptions),
      exceptionEntries(headConfig.python?.exceptions),
      scope,
    ),
    ...rootRemovals(scope),
    ...testRootAdditions(baseConfig, headConfig, scope),
  ];
}
