import { DataSource } from "typeorm"; export const db = new DataSource({ type: "postgres", logging: ["warn", "query", "migration"], maxQueryExecutionTime: 500 });
