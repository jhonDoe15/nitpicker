import { Sequelize } from "sequelize"; export async function start(sequelize) { await sequelize.sync({ force: true }); }
