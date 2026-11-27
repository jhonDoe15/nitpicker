import { Sequelize } from "sequelize"; export const db = new Sequelize(url, { logging: (sql) => { console.log(sql); } });
