import { Sequelize } from "sequelize"; export const db = new Sequelize(url, { logging: (sql) => { logger.verbose(sql); } });
