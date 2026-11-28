async function f(db: any, cache: any) {
  await db.query(`BEGIN`);
  cache.set(1, 1);
}
