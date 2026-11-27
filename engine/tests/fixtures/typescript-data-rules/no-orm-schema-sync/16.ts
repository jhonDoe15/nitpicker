import { Sequelize } from "sequelize"; import { rimraf } from "rimraf"; export const clean = (p) => rimraf.sync(p);
