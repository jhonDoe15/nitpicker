import path from 'node:path';
import { lintRecipe, type PlanRequest } from '../plan/lint-recipe.mts';
import { fileNameComplies, fileNameParts, fileNameRuleOptions } from '../typed/preset-views.mts';
import type { FixContext, Planned } from '../typed/project-types.mts';
import { declined, inCasing, isCodeFile, layoutOf, planFileMove } from '../typed/project-views.mts';

const CASING = /^File name "[^"]+" is not ([\w-]+),/u;

function scopeOf(context: FixContext): (name: string) => boolean {
  const layout = layoutOf(context.inputs);
  return (name: string) =>
    isCodeFile(name) &&
    (layout.isSourceFile(name) || layout.isTestFile(name)) &&
    !layout.isExcluded(name);
}

function renamedPath(name: string, casing: string): string | undefined {
  const { base, name: file } = fileNameParts(name);
  const newBase = inCasing(base, casing);
  return newBase === undefined || newBase === ''
    ? undefined
    : path.posix.join(path.posix.dirname(name), newBase + file.slice(base.length));
}

function planMessage({ context, project, name, message }: PlanRequest): Planned {
  const [, casing] = CASING.exec(message.message) ?? [];
  const to = casing === undefined ? undefined : renamedPath(name, casing);
  if (to === undefined || !fileNameComplies(to, casing, project.read(name))) {
    return declined('the name has no form in the expected casing');
  }
  return planFileMove(context, project, { from: name, to });
}

export const fileNameCasingRecipe = lintRecipe({
  id: 'typescript-file-name-casing',
  ruleId: 'file-name-casing',
  scopeOf,
  optionsOf: (context) => [fileNameRuleOptions(context.inputs?.headPolicy ?? {})],
  planMessage,
});
