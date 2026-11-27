export async function guarded(db) {
  return db.selectFrom('asset').where('\uD83D deletedAt = 1').execute();
}
export async function named(db) {
  return db.selectFrom('asset\uD83D').selectAll().execute();
}
export async function known(knex) {
  return knex('\uD83Dassets').first();
}
