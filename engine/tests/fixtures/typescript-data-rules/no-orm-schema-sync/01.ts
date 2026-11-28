import { DataSource } from "typeorm"; export const db = new DataSource({ type: "postgres", synchronize: false, migrationsRun: true, migrations: ["dist/migrations/*.js"] });
