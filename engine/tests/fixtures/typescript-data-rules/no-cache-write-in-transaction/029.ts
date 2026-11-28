async function f(db: any, cache: any) {
  await db.query('BEGIN');
  await db.query(`COMMIT`);
  cache.set(1, 1);
}
