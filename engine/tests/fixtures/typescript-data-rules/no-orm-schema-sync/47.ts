import { Sequelize } from "sequelize"; export async function start() { await Sequelize.sync({ alter: true }); }
