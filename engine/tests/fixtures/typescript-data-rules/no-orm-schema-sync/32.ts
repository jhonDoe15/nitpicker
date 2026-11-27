const { Sequelize } = require("sequelize"); const db = new Sequelize(url); module.exports = async () => { await db.sync(); };
