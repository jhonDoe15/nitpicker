import { DataSource } from "typeorm"; const SYNC = true; export const options = { type: "postgres", synchronize: SYNC, dropSchema: !isProduction };
