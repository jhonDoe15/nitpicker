import path from 'node:path';
import { lintRecipe, type PlanRequest } from '../plan/lint-recipe.mts';
import type { FixContext, Planned, Project } from '../typed/project-types.mts';
import {
  existingRoots,
  globMatcher,
  pathBelowRoot,
  helperName,
  testAreaGlobsFor,
} from '../typed/preset-views.mts';
import {
  declined,
  isCodeFile,
  layoutOf,
  moduleReferences,
  planFileMove,
} from '../typed/project-views.mts';

const SUPPORT_DIRECTORY = 'test-support';
const RUNNABLE_EXTENSION = /(\.[cm]?[jt]sx?)$/u;

function matcherFor(
  globs: readonly string[],
  excludedGlobs: readonly string[],
): (name: string) => boolean {
  const included = globs.map(globMatcher);
  const excluded = excludedGlobs.map(globMatcher);
  return (name: string) =>
    isCodeFile(name) &&
    included.some((matcher) => matcher.test(name)) &&
    !excluded.some((matcher) => matcher.test(name));
}

function importersOf(project: Project, target: string): string[] {
  return project.names.filter((name) =>
    moduleReferences(project.sourceFile(name)).some(
      ({ specifier }) => specifier !== undefined && project.resolve(specifier, name) === target,
    ),
  );
}

function testRootOf(context: FixContext): string {
  const layout = layoutOf(context.inputs);
  return existingRoots(context.projectRoot, layout.testRoots)[0] ?? layout.testRoots[0] ?? '';
}

function helperOptions(
  context: FixContext,
): { readonly colocated: true } | { readonly testRoot: string } {
  const layout = layoutOf(context.inputs);
  return layout.colocatedTests ? { colocated: true } : { testRoot: testRootOf(context) };
}

function helperTarget(context: FixContext, name: string): string {
  const layout = layoutOf(context.inputs);
  if (layout.colocatedTests) {
    return path.posix.join(path.posix.dirname(name), SUPPORT_DIRECTORY, path.posix.basename(name));
  }
  const rest = pathBelowRoot(layout.sourceRoots, name)
    .split('/')
    .filter((part) => part !== SUPPORT_DIRECTORY);
  return path.posix.join(testRootOf(context), SUPPORT_DIRECTORY, ...rest);
}

function productionImporter(
  context: FixContext,
  project: Project,
  name: string,
): string | undefined {
  const layout = layoutOf(context.inputs);
  const options = helperOptions(context);
  return importersOf(project, name).find(
    (importer) =>
      layout.isSourceFile(importer) &&
      helperName(importer, { colocated: 'colocated' in options }) === undefined,
  );
}

function planHelper({ context, project, name }: PlanRequest): Planned {
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

function uncollectedTarget(name: string): string {
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

function integrationTarget(context: FixContext, name: string): string {
  const layout = layoutOf(context.inputs);
  const unitRoot = layout.testRoots.find((root) => name.startsWith(`${root}/unit/`));
  if (unitRoot !== undefined) {
    return `${unitRoot}/integration/${name.slice(unitRoot.length + '/unit/'.length)}`;
  }
  const rest = pathBelowRoot(layout.sourceRoots, name)
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
