import {
  isReactProject,
  readDependencyNames,
} from '../../../preset/eslint-config/scope-support.mjs';
import {
  namingConvention,
  usesRouteHandlerFramework,
} from '../../../preset/eslint-config/policy/production-policy.mjs';
import { renameEdits } from '../edits/symbol-rename.mjs';
import { verifyEdits } from '../edits/verify-edits.mjs';
import { exportsName, symbolReferenceProblem } from '../edits/declines.mjs';
import { lintRecipe } from '../plan/lint-recipe.mjs';
import { inCasing } from '../model/names.mjs';
import { productionScope } from '../model/project-model.mjs';

const MESSAGE = /name `([^`]+)` must match one of the following formats: ([^\n]+)$/u;
const UNDERSCORES = /^_*/u;

function expectedName(message) {
  const [, name, formats] = MESSAGE.exec(message) ?? [];
  if (name === undefined) {
    return undefined;
  }
  const [format] = formats.split(', ');
  const [prefix] = UNDERSCORES.exec(name);
  const converted = inCasing(name.slice(prefix.length), format);
  return converted === undefined || converted === ''
    ? undefined
    : { name, expected: prefix + converted };
}

function optionsFor(context) {
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

function planMessage({ context, project, name, message }) {
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
