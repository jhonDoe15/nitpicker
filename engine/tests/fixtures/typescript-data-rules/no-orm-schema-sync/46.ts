import { DataSource } from "typeorm"; import { dataSource } from "typeorm"; export async function start() { await dataSource.synchronize(true); }
