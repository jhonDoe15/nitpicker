import { Sequelize } from "sequelize"; export const db = new Sequelize(url, { logging: false, logQueryParameters: true });
