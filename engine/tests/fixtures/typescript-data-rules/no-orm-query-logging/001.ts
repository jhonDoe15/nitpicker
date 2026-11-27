import { DataSource } from "typeorm"; export const db = new DataSource({ type: "postgres", logging: false, maxQueryExecutionTime: 500 });
