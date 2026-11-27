export async function start(app) { await app.sequelize.sync(); }
