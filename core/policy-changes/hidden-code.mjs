import { globToRegExp } from '../../shared/glob.mjs';
import { resolveLayout, resolveLayoutFor } from '../../languages/typescript/preset/layout.mjs';
import { isUnder } from './policy-scope.mjs';

const LISTED_FILES = 3;
const TEST_ROOTS = 'layout.testRoots';
const ALLOWED_FORM =
  'Write new code as production code under the source roots, where the gate checks it';

function kept(baseGlobs = [], headGlobs = []) {
  return headGlobs.filter((glob) => baseGlobs.includes(glob));
}

function globHiders(label, globs) {
  return globs.map((glob) => {
    const matcher = globToRegExp(glob);
    function covers(file) {
      return matcher.test(file);
    }
    return { label: `${label} ${glob}`, covers, coveredInBase: covers, hidesFromImporters: true };
  });
}

function coversBaseCode(hider, scope) {
  return scope.checked.some((file) => {
    const basePath = scope.basePathOf(file);
    return scope.existsInBase(basePath) && hider.coveredInBase(basePath);
  });
}

function exceptionHiders(label, [baseExceptions = [], headExceptions = []]) {
  return headExceptions.flatMap(({ rule, paths }) => {
    const basePaths = baseExceptions
      .filter((entry) => entry.rule === rule)
      .flatMap((entry) => entry.paths);
    return globHiders(`${label} ${rule} for`, kept(basePaths, paths)).map((hider) => ({
      ...hider,
      hidesFromImporters: false,
    }));
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
        hidesFromImporters: true,
      };
    });
}

function isNewlyHidden(hider, file, scope) {
  const basePath = scope.basePathOf(file);
  return basePath === file ? !scope.existsInBase(file) : !hider.coveredInBase(basePath);
}

function listed(entries) {
  const more = entries.length > LISTED_FILES ? `, and ${entries.length - LISTED_FILES} more` : '';
  return `${entries.slice(0, LISTED_FILES).join(', ')}${more}`;
}

function dormantChange(label, files) {
  const hidden = `hides code this change adds or moves: ${listed(files)}`;
  return `${label} covers no code of the base and ${hidden}. ${ALLOWED_FORM}`;
}

function importedChange(label, files, imports) {
  const entries = files.map((file) => `${file} (imported by ${imports.get(file)})`);
  const hidden = `hides code this change adds or moves that production code imports: ${listed(entries)}`;
  return `${label} ${hidden}. ${ALLOWED_FORM}`;
}

function hiderChanges(hider, scope) {
  const files = scope.checked
    .filter((file) => hider.covers(file) && isNewlyHidden(hider, file, scope))
    .toSorted();
  if (files.length === 0) {
    return [];
  }
  if (!coversBaseCode(hider, scope)) {
    return [dormantChange(hider.label, files)];
  }
  const imports = scope.productionImports();
  const imported = hider.hidesFromImporters ? files.filter((file) => imports.has(file)) : [];
  return imported.length === 0 ? [] : [importedChange(hider.label, imported, imports)];
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
    ...exceptionHiders('exception', [baseConfig.exceptions, headConfig.exceptions]),
    ...exceptionHiders('python.exceptions', [
      baseConfig.python?.exceptions,
      headConfig.python?.exceptions,
    ]),
    ...testRootHiders(baseConfig, headConfig, scope),
  ];
  return { loosened: hiders.flatMap((hider) => hiderChanges(hider, scope)), changed: [] };
}
