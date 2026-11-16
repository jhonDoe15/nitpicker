import { fieldOf, isText, listOf } from '../../../shared/values/readers.mts';
import type { RecipeEdit, RecipeFix } from './fix-types.mts';

const TEXT_EDITS = new Set(['write', 'delete', 'untrack']);

function isRecipeEdit(value: unknown): value is RecipeEdit {
  const type = fieldOf(value, 'type');
  if (type === 'replace') {
    return (
      isText(fieldOf(value, 'path')) &&
      typeof fieldOf(value, 'start') === 'number' &&
      typeof fieldOf(value, 'end') === 'number' &&
      isText(fieldOf(value, 'text'))
    );
  }
  if (type === 'move') {
    return isText(fieldOf(value, 'from')) && isText(fieldOf(value, 'to'));
  }
  return (
    isText(type) &&
    TEXT_EDITS.has(type) &&
    isText(fieldOf(value, 'path')) &&
    (type !== 'write' || isText(fieldOf(value, 'text')))
  );
}

function isRecipeFix(value: unknown): value is RecipeFix {
  const finding = fieldOf(value, 'finding');
  const edits = fieldOf(value, 'edits');
  return (
    isText(fieldOf(finding, 'tool')) &&
    isText(fieldOf(finding, 'rule')) &&
    isText(fieldOf(finding, 'path')) &&
    typeof fieldOf(finding, 'line') === 'number' &&
    Array.isArray(edits) &&
    edits.every(isRecipeEdit)
  );
}

export function recipeFixesOf(value: unknown): RecipeFix[] {
  return listOf(value).map((fix) => {
    if (!isRecipeFix(fix)) {
      throw new TypeError(
        'A recipe helper returned a fix without a finding or with an unknown edit',
      );
    }
    return fix;
  });
}
