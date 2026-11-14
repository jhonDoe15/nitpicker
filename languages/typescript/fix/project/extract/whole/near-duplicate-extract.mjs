import { createRequire } from 'node:module';
import { wholeCandidates } from '../../../../../../shared/fix/recipes/extract/candidates.mjs';
import { declineNote } from '../../../../../../shared/fix/recipes/extract/names.mjs';
import { nearDuplicateMatches } from '../../../../../../shared/rules/near-duplicates/near-duplicates.mjs';
import { verifyEdits } from '../../edits/verify-edits.mjs';
import { productionScope, withProject } from '../../model/project-model.mjs';
import { wholeExtraction } from './extraction.mjs';

const require = createRequire(import.meta.url);

function reuseModules() {
  return {
    units: require('../../../../preset/structure/reuse/near-duplicates/units.mjs'),
    paths: require('../../../../preset/structure/reuse/reuse-paths.mjs'),
  };
}

function unitNodes(found, unit) {
  return found.nodes[found.units.findIndex(({ name }) => name === unit.name)];
}

function foundIn(project, name, context) {
  const sourceFile = project.sourceFile(name);
  const { nearDuplicateUnits, nearDuplicateUnitNodes } = reuseModules().units;
  const units = sourceFile === undefined ? [] : nearDuplicateUnits(sourceFile, name);
  const isExcepted = context.inputs?.isExcepted ?? (() => false);
  return {
    ...wholeCandidates(nearDuplicateMatches(units, { isExcepted })),
    units,
    nodes: sourceFile === undefined ? [] : nearDuplicateUnitNodes(sourceFile),
  };
}

function planCandidate(candidate, found, env) {
  const units = [candidate.first, candidate.second].map((unit) => unitNodes(found, unit));
  const input = {
    units,
    label: candidate.first.name,
    engineHoles: candidate.finding.parameters.length,
  };
  const planned = wholeExtraction(input, env);
  if (planned.edits === undefined) {
    return planned;
  }
  const unsafe = verifyEdits(env.context, env.project, planned.edits);
  return unsafe === undefined ? planned : { declined: unsafe };
}

function planFile(name, project, context) {
  const sourceFile = project.sourceFile(name);
  const env = {
    project,
    context,
    sourceFile,
    path: name,
    checker: project.program.getTypeChecker(),
  };
  const found = foundIn(project, name, context);
  const planned = found.candidates.map((candidate) => ({
    candidate,
    result: planCandidate(candidate, found, env),
  }));
  return {
    fixes: planned
      .filter(({ result }) => result.edits !== undefined)
      .map(({ candidate, result }) => ({ finding: candidate.reported, edits: result.edits })),
    notes: [
      ...found.notes,
      ...planned
        .filter(({ result }) => result.edits === undefined)
        .map(({ candidate, result }) => declineNote(candidate.reported, result.declined)),
    ],
  };
}

function eligibleNames(context) {
  const inScope = productionScope(context.inputs);
  const { isReuseProductionPath } = reuseModules().paths;
  return context.files
    .map(({ path }) => path)
    .filter((name) => inScope(name) && isReuseProductionPath(name) && context.accepts(name));
}

export const nearDuplicateExtractRecipe = {
  id: 'typescript-extract-near-duplicate',
  rules: [{ tool: 'structure', rule: 'near-duplicate' }],
  presets: ['typescript', 'javascript'],
  scope: 'project',
  safety: 'safe',
  plan(context) {
    return withProject(context, (project) => {
      const planned = eligibleNames(context).map((name) => planFile(name, project, context));
      return {
        fixes: planned.flatMap(({ fixes }) => fixes),
        notes: planned.flatMap(({ notes }) => notes),
      };
    });
  },
};
