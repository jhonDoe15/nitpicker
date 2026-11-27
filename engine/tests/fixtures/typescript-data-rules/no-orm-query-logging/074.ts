import { DataSource } from "typeorm"; const shared = { type: "postgres", logging: true }; export const db = new DataSource(shared);
