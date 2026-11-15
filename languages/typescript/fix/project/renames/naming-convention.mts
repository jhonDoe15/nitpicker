import { lintRecipe, type PlanRequest } from '../plan/lint-recipe.mts';
import {
  exportsName,
  inCasing,
  productionScope,
  renameEdits,
  symbolReferenceProblem,
  verifyEdits,
} from '../typed/project-views.mts';
import {
  isReactProject,
  namingConvention,
  readDependencyNames,
  usesRouteHandlerFramework,
} from '../typed/policy-views.mts';
import type { FixContext, Planned } from '../typed/project-types.mts';

const MESSAGE = /name `([^`]+)` must match one of the following formats: ([^\n]+)$/u;
const UNDERSCORES = /^_*/u;

function expectedName(
  message: string,
): { readonly name: string; readonly expected: string } | undefined {
  const [, name, formats] = MESSAGE.exec(message) ?? [];
  if (name === undefined || formats === undefined) {
    return undefined;
  }
  const [format = ''] = formats.split(', ');
  const [prefix = ''] = UNDERSCORES.exec(name) ?? [];
  const converted = inCasing(name.slice(prefix.length), format);
  return converted === undefined || converted === ''
    ? undefined
    : { name, expected: prefix + converted };
}

function optionsFor(context: FixContext): readonly unknown[] {
  const { projectRoot, inputs = {} } = context;
  const layout = inputs.layout;
  return namingConvention({
    react: isReactProject({
      projectRoot,
      react: inputs.headPolicy?.react,
      javascript: layout?.javascript === true,
    }),
    routeHandlers: usesRouteHandlerFramework(readDependencyNames(projectRoot)),
  }).slice(1);
}

function planMessage({ context, project, name, message }: PlanRequest): Planned | undefined {
  const wanted = expectedName(message.message);
  if (message.messageId !== 'doesNotMatchFormat' || wanted === undefined) {
    return undefined;
  }
  const renamed = renameEdits(project, {
    name,
    offset: message.start,
    newName: wanted.expected,
    accepts: context.accepts,
  });
  if (renamed.declined !== undefined) {
    return renamed;
  }
  const problem = exportsName(project, name, wanted.name)
    ? symbolReferenceProblem(project, { target: name, exportName: wanted.name })
    : undefined;
  const unsafe = problem ?? verifyEdits(context, project, renamed.edits);
  return unsafe === undefined ? { edits: renamed.edits } : { declined: unsafe };
}

export const namingConventionRecipe = lintRecipe({
  id: 'typescript-naming-convention',
  ruleId: 'naming-convention',
  scopeOf: (context) => productionScope(context.inputs),
  optionsOf: optionsFor,
  planMessage,
});
