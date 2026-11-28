await knex.transaction(async (trx) => { await trx('orders').insert({}); await fetch(url); });
export {};
