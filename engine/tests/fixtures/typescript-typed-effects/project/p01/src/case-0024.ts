await db.transaction(async (tx) => { await Promise.all(ids.map((id) => tx.insert(id))); await fetch(url); });
export {};
