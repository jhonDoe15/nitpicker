import { DataSource } from "typeorm"; const dataSource = new DataSource(options); export const start = () => dataSource.synchronize();
