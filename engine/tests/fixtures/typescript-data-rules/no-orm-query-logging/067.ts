import { DataSource } from "typeorm"; export const db = new DataSource({ type: "postgres", logging: process.env.DB_LOG === "1" });
