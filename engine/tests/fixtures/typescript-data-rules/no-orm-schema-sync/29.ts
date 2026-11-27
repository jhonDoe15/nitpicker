import { DataSource } from "typeorm"; export async function reset(dataSource) { await dataSource.dropDatabase(); }
