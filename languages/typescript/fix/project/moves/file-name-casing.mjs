import path from 'node:path';
import {
  fileNameComplies,
  fileNameParts,
  fileNameRuleOptions,
} from '../../../conventions/file-name-casing.mjs';
import { planFileMove } from '../edits/file-move.mjs';
import { declined } from '../edits/text-edits.mjs';
import { inCasing } from '../model/names.mjs';
import { isCodeFile, layoutOf } from '../model/project-model.mjs';
import { lintRecipe } from '../plan/lint-recipe.mjs';

const CASING = /^File name "[^"]+" is not ([\w-]+),/u;

function scopeOf(context) {
  const layout = layoutOf(context.inputs);
  return (name) =>
    isCodeFile(name) &&
    (layout.isSourceFile(name) || layout.isTestFile(name)) &&
    !layout.isExcluded(name);
}

function renamedPath(name, casing) {
  const { base, name: file } = fileNameParts(name);
  const newBase = inCasing(base, casing);
  return newBase === undefined || newBase === ''
    ? undefined
    : path.posix.join(path.posix.dirname(name), newBase + file.slice(base.length));
}

function planMessage({ context, project, name, message }) {
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
