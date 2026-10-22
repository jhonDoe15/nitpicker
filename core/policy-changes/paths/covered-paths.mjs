import { CONFIG_FILE_NAME } from '../../../shared/config.mjs';
import { resolveLayoutFor } from '../../../languages/typescript/preset/layout.mjs';
import { isUnder, matcherOf } from '../policy-scope.mjs';
import {
  globsCovering,
  globsOfSubject,
  subjectLabel,
  subjectsOf,
} from './exceptions/exception-scopes.mjs';
import { keyedExclusions, testRootReclassifier } from './hiding.mjs';
import { duplicateFolderExclusions } from './duplicate-folders.mjs';

const NOTHING_NEW = 'covers no checked file it did not cover before';

function newlyCovered(baseGlobs, headGlob, { paths, basePathOf = (file) => file }) {
  const before = matcherOf(baseGlobs);
  const after = matcherOf([headGlob]);
  return paths.filter((file) => after(file) && !before(basePathOf(file)));
}

function addedGlob(text, covered, scope) {
  const code = new Set(scope.code);
  return covered.length === 0
    ? { loosened: [], changed: [`${text} (${NOTHING_NEW})`] }
    : {
        loosened: [
          { text, files: [CONFIG_FILE_NAME, ...covered.filter((file) => code.has(file))] },
        ],
        changed: [],
      };
}

function exclusionChanges(baseConfig, headConfig, scope) {
  return [keyedExclusions, duplicateFolderExclusions].flatMap((exclusions) =>
    exclusionChangesOf(
      exclusions(baseConfig, headConfig.preset ?? 'typescript'),
      exclusions(headConfig),
      scope,
    ),
  );
}

function exclusionChangesOf(base, head, scope) {
  const baseGlobs = base.map(({ glob }) => glob);
  const keyOf = new Map(base.map(({ glob, key }) => [glob, key]));
  const headGlobs = new Set(head.map(({ glob }) => glob));
  return [
    ...head.map(({ glob, key }) => {
      if (!keyOf.has(glob)) {
        return addedGlob(
          `${key} added: ${glob}`,
          newlyCovered(baseGlobs, glob, { paths: scope.keptPaths }),
          scope,
        );
      }
      const moved =
        keyOf.get(glob) === key ? [] : [`${glob} moved from ${keyOf.get(glob)} to ${key}`];
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

function exceptionChanges(baseExceptions = [], headExceptions = [], scope) {
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
                text: `exception added: ${rule} for ${covering.map(({ glob }) => glob).join(', ')} (${reason})`,
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

function entryPointChanges(baseConfig, headConfig, scope) {
  return [
    ...entryPointChangesOf('layout.entryPoints', {
      before: baseConfig.layout?.entryPoints ?? [],
      after: headConfig.layout?.entryPoints ?? [],
      scope,
    }),
    ...entryPointChangesOf('python.entryPoints', {
      before: baseConfig.python?.entryPoints ?? [],
      after: headConfig.python?.entryPoints ?? [],
      scope,
    }),
  ];
}

function entryPointChangesOf(key, { before, after, scope }) {
  return [
    ...after
      .filter((glob) => !before.includes(glob))
      .map((glob) =>
        addedGlob(
          `${key} added: ${glob}`,
          newlyCovered(before, glob, {
            paths: scope.codePaths,
            basePathOf: scope.basePathOf,
          }),
          scope,
        ),
      ),
    {
      loosened: [],
      changed: before
        .filter((glob) => !after.includes(glob))
        .map((glob) => `${key} removed: ${glob}`),
    },
  ];
}

function rootRemovals(scope) {
  const keys = Object.keys(scope.headRoots).filter((key) => key in scope.baseRoots);
  const removed = keys.flatMap((key) =>
    scope.baseRoots[key]
      .filter((root) => !scope.headRoots[key].includes(root))
      .map((root) => ({ key, root })),
  );
  function lost({ key, root }) {
    return scope.code.filter(
      (file) => isUnder(file, root) && !scope.headRoots[key].some((kept) => isUnder(file, kept)),
    );
  }
  return removed.map((entry) => {
    const files = lost(entry);
    const text = `${entry.key} removed: ${entry.root}`;
    return files.length === 0
      ? { loosened: [], changed: [`${text} (no checked file was under it)`] }
      : { loosened: [{ text, files: [CONFIG_FILE_NAME, ...files] }], changed: [] };
  });
}

function testRootAdditions(baseConfig, headConfig, scope) {
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
          text: `layout.testRoots added: ${root} (production code under it becomes test code)`,
          files: [CONFIG_FILE_NAME, ...files],
        },
      ],
      changed: [],
    }));
}

export function coveredPathChanges(baseConfig, headConfig, scope) {
  return [
    ...exclusionChanges(baseConfig, headConfig, scope),
    ...entryPointChanges(baseConfig, headConfig, scope),
    ...exceptionChanges(baseConfig.exceptions, headConfig.exceptions, scope),
    ...exceptionChanges(baseConfig.python?.exceptions, headConfig.python?.exceptions, scope),
    ...rootRemovals(scope),
    ...testRootAdditions(baseConfig, headConfig, scope),
  ];
}
