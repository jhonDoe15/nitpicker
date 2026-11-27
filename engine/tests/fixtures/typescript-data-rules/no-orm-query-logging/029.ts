import { Sequelize } from "sequelize"; export const db = new Sequelize(url, { logging: isDev ? console.log : false });
