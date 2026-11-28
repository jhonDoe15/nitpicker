import { Sequelize } from "sequelize"; export const db = new Sequelize(url, { logging: (sql) => logger.debug(sql) });
