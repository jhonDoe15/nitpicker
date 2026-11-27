import { Sequelize } from "sequelize"; export const db = new Sequelize(url, { benchmark: true, logging: (sql, ms) => { if (ms > 500) logger.warn({ ms }, "slow query"); } });
