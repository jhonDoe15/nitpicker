import { createRequire } from 'node:module';
import { collected, outcomeOf } from '../../../../../../shared/fix/recipes/extract/outcomes.mjs';
import { nearDuplicateMatches } from '../../../../../../shared/rules/near-duplicates/near-duplicates.mjs';
import { verifyEdits } from '../../edits/verify-edits.mjs';
import { productionScope, withProject } from '../../model/project-model.mjs';

const require = createRequire(import.meta.url);

function reuseModules() {
  return {
    units: require('../../../../preset/structure/reuse/near-duplicates/units.mjs'),
    paths: require('../../../../preset/structure/reuse/reuse-paths.mjs'),
  };
}

export function unitNodeOf(found, unit) {
  return found.nodes[found.units.findIndex(({ name }) => name === unit.name)];
}

function foundIn(project, name, context) {
  const sourceFile = project.sourceFile(name);
  const { nearDuplicateUnits, nearDuplicateUnitNodes } = reuseModules().units;
  const units = sourceFile === undefined ? [] : nearDuplicateUnits(sourceFile, name);
  const isExcepted = context.inputs?.isExcepted ?? (() => false);
  return {
    matches: nearDuplicateMatches(units, { isExcepted }),
    units,
    nodes: sourceFile === undefined ? [] : nearDuplicateUnitNodes(sourceFile),
  };
}

function verified(planned, env) {
  if (planned.edits === undefined) {
    return planned;
  }
  const unsafe = verifyEdits(env.context, env.project, planned.edits);
  return unsafe === undefined ? planned : { declined: unsafe };
}

function planFile(name, run) {
  const { project, context, strategy } = run;
  const env = {
    project,
    context,
    sourceFile: project.sourceFile(name),
    path: name,
    checker: project.program.getTypeChecker(),
    claimed: new Set(),
  };
  const found = foundIn(project, name, context);
  const { candidates, notes } = strategy.candidatesOf(found.matches);
  const outcomes = candidates.map((candidate) =>
    outcomeOf(candidate, verified(strategy.extract(strategy.inputOf(candidate, found), env), env)),
  );
  return collected(outcomes, notes);
}

function eligibleNames(context) {
  const inScope = productionScope(context.inputs);
  const { isReuseProductionPath } = reuseModules().paths;
  return context.files
    .map(({ path }) => path)
    .filter((name) => inScope(name) && isReuseProductionPath(name) && context.accepts(name));
}

export function planProject(context, strategy) {
  return withProject(context, (project) => {
    const run = { project, context, strategy };
    const planned = eligibleNames(context).map((name) => planFile(name, run));
    return {
      fixes: planned.flatMap(({ fixes }) => fixes),
      notes: planned.flatMap(({ notes }) => notes),
    };
  });
}
