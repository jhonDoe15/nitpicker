import path from 'node:path';
import { helperName } from '../../../preset/eslint-plugin/test-placement/no-test-helpers-in-source.mjs';
import { testAreaGlobsFor } from '../../../preset/eslint-config/strict-tests.mjs';
import { existingRoots, globMatcher } from '../../../preset/layout.mjs';
import { planFileMove } from '../edits/file-move.mjs';
import { declined } from '../edits/text-edits.mjs';
import { moduleReferences } from '../model/module-references.mjs';
import { isCodeFile, layoutOf } from '../model/project-model.mjs';
import { lintRecipe } from '../plan/lint-recipe.mjs';

const SUPPORT_DIRECTORY = 'test-support';
const RUNNABLE_EXTENSION = /(\.[cm]?[jt]sx?)$/u;

function matcherFor(globs, excludedGlobs) {
  const included = globs.map(globMatcher);
  const excluded = excludedGlobs.map(globMatcher);
  return (name) =>
    isCodeFile(name) &&
    included.some((matcher) => matcher.test(name)) &&
    !excluded.some((matcher) => matcher.test(name));
}

function importersOf(project, target) {
  return project.names.filter((name) =>
    moduleReferences(project.sourceFile(name)).some(
      ({ specifier }) => specifier !== undefined && project.resolve(specifier, name) === target,
    ),
  );
}

function testRootOf(context) {
  const layout = layoutOf(context.inputs);
  return existingRoots(context.projectRoot, layout.testRoots)[0] ?? layout.testRoots[0];
}

function helperOptions(context) {
  const layout = layoutOf(context.inputs);
  return layout.colocatedTests ? { colocated: true } : { testRoot: testRootOf(context) };
}

function helperTarget(context, name) {
  const layout = layoutOf(context.inputs);
  if (layout.colocatedTests) {
    return path.posix.join(path.posix.dirname(name), SUPPORT_DIRECTORY, path.posix.basename(name));
  }
  const root = layout.sourceRoots.find((candidate) => name.startsWith(`${candidate}/`));
  const rest = name
    .slice(root === undefined ? 0 : root.length + 1)
    .split('/')
    .filter((part) => part !== SUPPORT_DIRECTORY);
  return path.posix.join(testRootOf(context), SUPPORT_DIRECTORY, ...rest);
}

function productionImporter(context, project, name) {
  const layout = layoutOf(context.inputs);
  const options = helperOptions(context);
  return importersOf(project, name).find(
    (importer) =>
      layout.isSourceFile(importer) &&
      helperName(importer, { colocated: options.colocated === true }) === undefined,
  );
}

function planHelper({ context, project, name }) {
  const importer = productionImporter(context, project, name);
  return importer === undefined
    ? planFileMove(context, project, { from: name, to: helperTarget(context, name) })
    : declined(`${importer} is production code that imports it`);
}

export const noTestHelpersInSourceRecipe = lintRecipe({
  id: 'typescript-no-test-helpers-in-source',
  ruleId: 'no-test-helpers-in-source',
  scopeOf: (context) => {
    const layout = layoutOf(context.inputs);
    return matcherFor(layout.sourceGlobs, [...layout.excludedGlobs, ...testAreaGlobsFor(layout)]);
  },
  optionsOf: (context) => [helperOptions(context)],
  planMessage: planHelper,
});

function uncollectedTarget(name) {
  return name.replace(RUNNABLE_EXTENSION, '.test$1');
}

export const noUncollectedTestsRecipe = lintRecipe({
  id: 'typescript-no-uncollected-tests',
  ruleId: 'no-uncollected-tests',
  scopeOf: (context) => {
    const layout = layoutOf(context.inputs);
    return matcherFor(testAreaGlobsFor(layout), layout.excludedGlobs);
  },
  planMessage: ({ context, project, name }) =>
    planFileMove(context, project, { from: name, to: uncollectedTarget(name) }),
});

function integrationTarget(context, name) {
  const layout = layoutOf(context.inputs);
  const unitRoot = layout.testRoots.find((root) => name.startsWith(`${root}/unit/`));
  if (unitRoot !== undefined) {
    return `${unitRoot}/integration/${name.slice(unitRoot.length + '/unit/'.length)}`;
  }
  const sourceRoot = layout.sourceRoots.find((root) => name.startsWith(`${root}/`));
  const rest = name
    .slice(sourceRoot.length + 1)
    .split('/')
    .filter((part) => part !== '__tests__');
  return path.posix.join(testRootOf(context), 'integration', ...rest);
}

export const noExternalExecutablesInUnitTestsRecipe = lintRecipe({
  id: 'typescript-no-external-executables-in-unit-tests',
  ruleId: 'no-external-executables-in-unit-tests',
  scopeOf: (context) => {
    const layout = layoutOf(context.inputs);
    return matcherFor(layout.unitTestGlobs, layout.excludedGlobs);
  },
  planMessage: ({ context, project, name }) =>
    planFileMove(context, project, { from: name, to: integrationTarget(context, name) }),
});
