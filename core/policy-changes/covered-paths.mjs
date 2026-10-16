import { globToRegExp } from '../../shared/glob.mjs';
import { resolveLayout, resolveLayoutFor } from '../../languages/typescript/preset/layout.mjs';
import { isUnder, matcherOf } from './policy-scope.mjs';

const NOTHING_NEW = 'covers no checked file it did not cover before';

function newlyCovered(baseGlobs, headGlob, scope) {
  const before = matcherOf(baseGlobs);
  const after = globToRegExp(headGlob);
  return scope.paths.some((file) => after.test(file) && !before(scope.basePathOf(file)));
}

function splitAdded(baseGlobs, headGlobs, scope) {
  const added = headGlobs.filter((glob) => !baseGlobs.includes(glob));
  const covering = added.filter((glob) => newlyCovered(baseGlobs, glob, scope));
  return { covering, idle: added.filter((glob) => !covering.includes(glob)) };
}

function addedGlobs(label, [baseGlobs, headGlobs], scope) {
  const { covering, idle } = splitAdded(baseGlobs, headGlobs, scope);
  return {
    loosened: covering.map((glob) => `${label} added: ${glob}`),
    changed: idle.map((glob) => `${label} added: ${glob} (${NOTHING_NEW})`),
  };
}

function removedGlobs(label, [baseGlobs, headGlobs]) {
  return {
    loosened: [],
    changed: baseGlobs
      .filter((glob) => !headGlobs.includes(glob))
      .map((glob) => `${label} removed: ${glob}`),
  };
}

function exclusions(config) {
  return [...resolveLayout(config.layout).excludedGlobs, ...(config.exclude ?? [])];
}

function exceptionChanges(baseExceptions = [], headExceptions = [], scope) {
  const parts = headExceptions.map(({ rule, paths, reason }) => {
    const baseGlobs = baseExceptions
      .filter((entry) => entry.rule === rule)
      .flatMap((entry) => entry.paths);
    const { covering, idle } = splitAdded(baseGlobs, paths, scope);
    return {
      loosened:
        covering.length === 0
          ? []
          : [`exception added: ${rule} for ${covering.join(', ')} (${reason})`],
      changed:
        idle.length === 0
          ? []
          : [`exception added: ${rule} for ${idle.join(', ')} (${NOTHING_NEW})`],
    };
  });
  const removed = baseExceptions.flatMap(({ rule, paths }) => {
    const kept = headExceptions
      .filter((entry) => entry.rule === rule)
      .flatMap((entry) => entry.paths);
    const dropped = paths.filter((glob) => !kept.includes(glob));
    return dropped.length === 0 ? [] : [`exception removed: ${rule} for ${dropped.join(', ')}`];
  });
  return {
    loosened: parts.flatMap((part) => part.loosened),
    changed: [...parts.flatMap((part) => part.changed), ...removed],
  };
}

function rootRemovals(scope) {
  const keys = Object.keys(scope.headRoots).filter((key) => key in scope.baseRoots);
  const removed = keys.flatMap((key) =>
    scope.baseRoots[key]
      .filter((root) => !scope.headRoots[key].includes(root))
      .map((root) => ({ key, root })),
  );
  function loses({ key, root }) {
    return scope.code.some(
      (file) => isUnder(file, root) && !scope.headRoots[key].some((kept) => isUnder(file, kept)),
    );
  }
  return {
    loosened: removed.filter(loses).map(({ key, root }) => `${key} removed: ${root}`),
    changed: removed
      .filter((entry) => !loses(entry))
      .map(({ key, root }) => `${key} removed: ${root} (no checked file was under it)`),
  };
}

function testRootAdditions(baseConfig, headConfig, scope) {
  const key = 'layout.testRoots';
  if (!(key in scope.headRoots) || !(key in scope.baseRoots)) {
    return { loosened: [], changed: [] };
  }
  const base = resolveLayoutFor(baseConfig);
  const head = resolveLayoutFor(headConfig);
  const added = scope.headRoots[key].filter((root) => !scope.baseRoots[key].includes(root));
  function reclassifies(root) {
    return scope.code.some(
      (file) =>
        isUnder(file, root) &&
        !head.isSourceFile(file) &&
        base.isSourceFile(scope.basePathOf(file)),
    );
  }
  return {
    loosened: added
      .filter(reclassifies)
      .map((root) => `${key} added: ${root} (production code under it becomes test code)`),
    changed: [],
  };
}

export function coveredPathChanges(baseConfig, headConfig, scope) {
  const baseExclusions = exclusions(baseConfig);
  const headExclusions = exclusions(headConfig);
  const headLayout = resolveLayout(headConfig.layout);
  const baseEntryPoints = baseConfig.layout?.entryPoints ?? [];
  const headEntryPoints = headConfig.layout?.entryPoints ?? [];
  return [
    removedGlobs('exclude', [baseConfig.exclude ?? [], headExclusions]),
    removedGlobs('layout.excludedGlobs', [
      resolveLayout(baseConfig.layout).excludedGlobs,
      headExclusions,
    ]),
    removedGlobs('layout.entryPoints', [baseEntryPoints, headEntryPoints]),
    addedGlobs('exclude', [baseExclusions, headConfig.exclude ?? []], scope),
    addedGlobs('layout.excludedGlobs', [baseExclusions, headLayout.excludedGlobs], scope),
    addedGlobs('layout.entryPoints', [baseEntryPoints, headEntryPoints], scope),
    exceptionChanges(baseConfig.exceptions, headConfig.exceptions, scope),
    exceptionChanges(baseConfig.python?.exceptions, headConfig.python?.exceptions, scope),
    rootRemovals(scope),
    testRootAdditions(baseConfig, headConfig, scope),
  ];
}
