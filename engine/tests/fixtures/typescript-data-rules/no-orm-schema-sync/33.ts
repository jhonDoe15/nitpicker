import { Sequelize as SQ } from "@sequelize/core"; const db = new SQ(url); export const start = () => db.sync({ alter: true });
