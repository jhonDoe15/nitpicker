import { Sequelize } from "sequelize"; const fg = require("fast-glob"); export const files = fg.sync(["*.ts"]);
