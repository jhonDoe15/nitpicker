import { DataSource } from "typeorm"; export async function start(dataSource) { await dataSource.synchronize(); }
