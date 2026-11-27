import { Sequelize } from "sequelize"; export const db = new Sequelize(url, { logging: (sql, ms) => { metrics.observe(ms); logger.debug(sql); } });
