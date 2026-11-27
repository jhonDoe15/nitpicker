import { Sequelize } from "sequelize"; export const db = new Sequelize(url, { logging: (sql) => { metrics.count(); logger.debug(sql); } });
