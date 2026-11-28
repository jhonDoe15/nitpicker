async function f(db: any, cache: any) {
  await db.query('BEGINK');
  cache.set(1, 1);
}
async function g(db: any, cache: any) {
  await db.query('BEGIN');
  await db.query('COMMITſ');
  cache.set(2, 2);
}
async function h(db: any, cache: any) {
  await db.query('BEGIN');
  await db.query('ROLLBACK');
  cache.set(3, 3);
}
