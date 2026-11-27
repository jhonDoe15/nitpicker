import { Sequelize } from "sequelize"; export const db = (base) => new Sequelize({ ...base, dialect: "postgres" });
