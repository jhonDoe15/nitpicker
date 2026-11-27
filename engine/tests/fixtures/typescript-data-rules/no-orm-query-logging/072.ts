import { DataSource } from "typeorm"; export const db = new DataSource({ type: "postgres", ...base, logging: true });
