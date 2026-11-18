import { code } from './text.mts';
import type { HandlerAuthFact, InMemoryFact, SoftDeleteFact } from './message-facts.mts';

function softDelete({ entity, column, read, filtered, total }: SoftDeleteFact): string {
  return [
    `Filter out deleted rows with the predicate the other reads of ${code(entity)} apply: ${code(read)}`,
    `reads ${code(entity)} without a condition on ${code(column)}, which ${String(filtered)} of the ${String(total)} reads of`,
    `it check, so a deleted row shows up here. Add the condition to the query (or \`@SQLRestriction\` on the`,
    'entity, so every read applies it); a trash, restore or purge read that wants the deleted rows goes in',
    '`exceptions`.',
  ].join(' ');
}

function inMemory({ entity, flag, source, guarded, units }: InMemoryFact): string {
  return [
    `This loop or lookup over ${code(entity)} items takes them from ${code(source)} and does not check`,
    `${code(flag)}, so deleted items are included. ${String(guarded)} of the ${String(units)} places that iterate ${code(entity)}`,
    `skip the deleted ones: filter here the same way (\`item.${flag}\`), load the collection with the filter`,
    '(a repository method or `@SQLRestriction`), or, for a view that wants the deleted items, add it to',
    '`exceptions`.',
  ].join(' ');
}

function handlerAuth({ shape, declared, total }: HandlerAuthFact): string {
  return [
    `This route handler declares no authorization, while ${String(declared)} of the ${String(total)} handlers of the project`,
    `do (usually \`${shape}\`), so it is open to every caller. Add the same requirement to the handler or`,
    'its controller class, or mark it public the way the project marks its public routes; a handler that a',
    '`SecurityFilterChain` opens on purpose (login, health) goes in `exceptions` for `effects/HandlerWithoutAuth`.',
  ].join(' ');
}

export const DELETED_MESSAGES = {
  SoftDeleteFilterMissing: softDelete,
  DeletedItemInMemory: inMemory,
  HandlerWithoutAuth: handlerAuth,
};
