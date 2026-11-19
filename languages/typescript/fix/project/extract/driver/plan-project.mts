import { createRequire } from 'node:module';
import type TypeScript from 'typescript';
import { fieldOf } from '../../../../../../shared/values/readers.mts';
import type {
  FixContext,
  Planned,
  Project,
  ProjectPlan,
  ReplaceEdit,
} from '../../typed/project-types.mts';
import { productionScope, verifyEdits, withProject } from '../../typed/project-views.mts';
import {
  extractEnv,
  type Candidate,
  type ExtractEnv,
  type Extracted,
  type Found,
  type Strategy,
  type UnitNode,
} from '../typed/extract-types.mts';
import { collected, nearDuplicateMatches, outcomeOf } from '../typed/typed-views.mts';

const require = createRequire(import.meta.url);

type ReuseModules = {
  readonly units: {
    readonly nearDuplicateUnits: (
      sourceFile: TypeScript.SourceFile,
      name: string,
    ) => { readonly name: string }[];
    readonly nearDuplicateUnitNodes: (sourceFile: TypeScript.SourceFile) => UnitNode[];
  };
  readonly paths: { readonly isReuseProductionPath: (name: string) => boolean };
};

function isUnitsModule(value: unknown): value is ReuseModules['units'] {
  return typeof fieldOf(value, 'nearDuplicateUnits') === 'function';
}

function isPathsModule(value: unknown): value is ReuseModules['paths'] {
  return typeof fieldOf(value, 'isReuseProductionPath') === 'function';
}

function reuseModules(): ReuseModules {
  const loadedUnits: unknown = require('../../../../preset/structure/reuse/near-duplicates/units.mjs');
  const loadedPaths: unknown = require('../../../../preset/structure/reuse/reuse-paths.mjs');
  if (!(isUnitsModule(loadedUnits) && isPathsModule(loadedPaths))) {
    throw new TypeError('The reuse modules do not load');
  }
  return {
    units: loadedUnits,
    paths: loadedPaths,
  };
}

export function unitNodeOf(found: Found, unit: { readonly name: string }): UnitNode {
  const node = found.nodes[found.units.findIndex(({ name }) => name === unit.name)];
  if (node === undefined) {
    throw new TypeError(`No syntax node for the unit ${unit.name}`);
  }
  return node;
}

function foundIn(project: Project, name: string, context: FixContext): Found {
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

const WIDENED =
  'the literal values did not type-check as a union, so the shared function takes their base type';

type Verified = Planned<ReplaceEdit> & { readonly note?: string };

function verified(planned: Extracted, env: ExtractEnv): Verified {
  if (planned.edits === undefined) {
    return { declined: planned.declined };
  }
  const unsafe = verifyEdits(env.context, env.project, planned.edits);
  if (unsafe === undefined || planned.widened === undefined) {
    return unsafe === undefined ? { edits: planned.edits } : { declined: unsafe };
  }
  const widenedUnsafe = verifyEdits(env.context, env.project, planned.widened);
  return widenedUnsafe === undefined
    ? { edits: planned.widened, note: WIDENED }
    : { declined: widenedUnsafe };
}

function outcomeWithNote(candidate: Candidate, result: Verified) {
  const outcome = outcomeOf(candidate, result);
  return outcome.fix === undefined || result.note === undefined
    ? outcome
    : { fix: { ...outcome.fix, note: result.note } };
}

function planFile<C extends Candidate, Input>(
  name: string,
  run: { project: Project; context: FixContext; strategy: Strategy<C, Input> },
): ProjectPlan {
  const { project, context, strategy } = run;
  const sourceFile = project.sourceFile(name);
  if (sourceFile === undefined) {
    return collected([], []);
  }
  const env = extractEnv({
    project,
    context,
    sourceFile,
    path: name,
    checker: project.program.getTypeChecker(),
  });
  const found = foundIn(project, name, context);
  const { candidates, notes } = strategy.candidatesOf(found.matches);
  const outcomes = candidates.map((candidate) =>
    outcomeWithNote(
      candidate,
      verified(strategy.extract(strategy.inputOf(candidate, found), env), env),
    ),
  );
  return collected(outcomes, notes);
}

function eligibleNames(context: FixContext): string[] {
  const inScope = productionScope(context.inputs);
  const { isReuseProductionPath } = reuseModules().paths;
  return context.files
    .map(({ path }) => path)
    .filter((name) => inScope(name) && isReuseProductionPath(name) && context.accepts(name));
}

export function planProject<C extends Candidate, Input>(
  context: FixContext,
  strategy: Strategy<C, Input>,
): ProjectPlan {
  return withProject(context, (project) => {
    const run = { project, context, strategy };
    const planned = eligibleNames(context).map((name) => planFile(name, run));
    return {
      fixes: planned.flatMap(({ fixes }) => fixes),
      notes: planned.flatMap(({ notes }) => notes),
    };
  });
}
