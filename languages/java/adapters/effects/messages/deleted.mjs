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

function inMemory({ entity, flag, source, guarded, units }) {
  return [
    `This loop or lookup over ${code(entity)} items takes them from ${code(source)} and does not check`,
    `${code(flag)}, so deleted items are included. ${guarded} of the ${units} places that iterate ${code(entity)}`,
    `skip the deleted ones: filter here the same way (\`item.${flag}\`), load the collection with the filter`,
    '(a repository method or `@SQLRestriction`), or, for a view that wants the deleted items, add it to',
    '`exceptions`.',
  ].join(' ');
}

export const DELETED_MESSAGES = {
  SoftDeleteFilterMissing: softDelete,
  DeletedItemInMemory: inMemory,
};
