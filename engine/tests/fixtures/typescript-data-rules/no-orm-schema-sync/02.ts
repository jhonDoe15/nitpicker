import { DataSource } from "typeorm"; export const db = new DataSource({ type: "postgres", entities, migrations });
