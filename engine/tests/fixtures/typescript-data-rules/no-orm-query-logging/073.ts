import { DataSource } from "typeorm"; export const db = new DataSource({ type: "postgres", logQueryParameters: process.env.DB_PARAMS === "1" });
