import { DataSource } from "typeorm"; export const options = { type: "sqlite", synchronize: process.env.DB_SYNC };
