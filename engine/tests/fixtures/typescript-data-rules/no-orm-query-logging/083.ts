import { defineConfig, MikroORM } from "@mikro-orm/postgresql"; export default defineConfig({ dbName: "app", debug: process.env.DEBUG === "1" });
