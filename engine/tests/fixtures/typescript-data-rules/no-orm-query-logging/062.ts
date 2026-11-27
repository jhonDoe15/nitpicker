import { defineConfig, MikroORM } from "@mikro-orm/postgresql"; export const orm = MikroORM.init({ dbName: "app", debug: ["info", "query-params"] });
