import { code } from './text.mjs';

function softDelete({ entity, column, read, filtered, total }) {
  return [
    `Filter out deleted rows with the predicate the other reads of ${code(entity)} apply: ${code(read)}`,
    `reads ${code(entity)} without a condition on ${code(column)}, which ${filtered} of the ${total} reads of`,
    `it check, so a deleted row shows up here. Add the condition to the query (or \`@SQLRestriction\` on the`,
    'entity, so every read applies it); a trash, restore or purge read that wants the deleted rows goes in',
    '`exceptions`.',
  ].join(' ');
}

export const DELETED_MESSAGES = {
  SoftDeleteFilterMissing: softDelete,
};
