import { Sequelize } from "sequelize"; import { Pool } from "pg"; export async function start(pool) { await pool.sync(); }
