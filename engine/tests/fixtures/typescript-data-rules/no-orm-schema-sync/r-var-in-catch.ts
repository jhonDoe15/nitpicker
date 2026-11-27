import { DataSource } from "typeorm";
try {} catch (s) { var s = true; new DataSource({ type: "postgres", logging: s }); }
export const d = new DataSource({ type: "postgres", synchronize: s });
try {} catch (q) { try {} catch (r) { var q = true; } new DataSource({ type: "postgres", dropSchema: q }); }
