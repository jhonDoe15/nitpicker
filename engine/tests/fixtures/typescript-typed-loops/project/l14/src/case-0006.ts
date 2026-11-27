for (const id of ids) { update.set({ amount: knex.raw('?::numeric', [id]) }); }
export {};
