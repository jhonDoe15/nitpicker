import { globToRegExp } from '../../shared/glob.mjs';
import { resolveLayout, resolveLayoutFor } from '../../languages/typescript/preset/layout.mjs';
import { isUnder } from './policy-scope.mjs';

const LISTED_FILES = 3;
const TEST_ROOTS = 'layout.testRoots';

function kept(baseGlobs = [], headGlobs = []) {
  return headGlobs.filter((glob) => baseGlobs.includes(glob));
}

function globHiders(label, globs) {
  return globs.map((glob) => {
    const matcher = globToRegExp(glob);
    const covers = (file) => matcher.test(file);
    return { label: `${label} ${glob}`, covers, coveredInBase: covers };
  });
}

function exceptionHiders(label, baseExceptions = [], headExceptions = []) {
  return headExceptions.flatMap(({ rule, paths }) => {
    const basePaths = baseExceptions
      .filter((entry) => entry.rule === rule)
      .flatMap((entry) => entry.paths);
    return globHiders(`${label} ${rule} for`, kept(basePaths, paths));
  });
}

function testRootHiders(baseConfig, headConfig, scope) {
  if (!(TEST_ROOTS in scope.headRoots) || !(TEST_ROOTS in scope.baseRoots)) {
    return [];
  }
  const head = resolveLayoutFor(headConfig);
  return kept(scope.baseRoots[TEST_ROOTS], scope.headRoots[TEST_ROOTS])
    .filter((root) => head.sourceRoots.some((sourceRoot) => isUnder(root, sourceRoot)))
    .map((root) => {
      const without = resolveLayoutFor({
        ...headConfig,
        layout: {
          ...headConfig.layout,
          testRoots: head.testRoots.filter((other) => other !== root),
        },
      });
      return {
        label: `${TEST_ROOTS} ${root}`,
        covers: (file) =>
          isUnder(file, root) && !head.isSourceFile(file) && without.isSourceFile(file),
        coveredInBase: (basePath) => isUnder(basePath, root),
      };
    });
}

function isNewlyHidden(hider, file, scope) {
  const basePath = scope.basePathOf(file);
  return basePath === file ? !scope.existsInBase(file) : !hider.coveredInBase(basePath);
}

function described(label, files) {
  const listed = files.slice(0, LISTED_FILES).join(', ');
  const more = files.length > LISTED_FILES ? `, and ${files.length - LISTED_FILES} more` : '';
  return `${label} hides code this change adds or moves: ${listed}${more}. Keep new code where the gate checks it`;
}

export function hiddenCodeChanges(baseConfig, headConfig, scope) {
  const hiders = [
    ...globHiders('exclude', kept(baseConfig.exclude, headConfig.exclude)),
    ...globHiders(
      'layout.excludedGlobs',
      kept(
        resolveLayout(baseConfig.layout).excludedGlobs,
        resolveLayout(headConfig.layout).excludedGlobs,
      ),
    ),
    ...exceptionHiders('exception', baseConfig.exceptions, headConfig.exceptions),
    ...exceptionHiders(
      'python.exceptions',
      baseConfig.python?.exceptions,
      headConfig.python?.exceptions,
    ),
    ...testRootHiders(baseConfig, headConfig, scope),
  ];
  return {
    loosened: hiders.flatMap((hider) => {
      const files = scope.checked
        .filter((file) => hider.covers(file) && isNewlyHidden(hider, file, scope))
        .toSorted();
      return files.length === 0 ? [] : [described(hider.label, files)];
    }),
    changed: [],
  };
}
