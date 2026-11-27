import { Sequelize } from "sequelize"; export const db = new Sequelize(url, { dialect: "postgres", pool: { max: 5 } });
