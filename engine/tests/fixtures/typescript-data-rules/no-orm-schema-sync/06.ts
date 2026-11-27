import { Sequelize } from "sequelize"; import glob from "glob"; export const files = glob.sync("models/*.js");
