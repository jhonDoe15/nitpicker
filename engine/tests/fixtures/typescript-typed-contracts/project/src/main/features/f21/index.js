/** @param {import('knex').Knex.Transaction} tx
 * @returns {Promise<void>} */
export function commit(tx) { return tx.commit(); }