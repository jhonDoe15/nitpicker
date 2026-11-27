import { defineConfig } from "@mikro-orm/postgresql"; export default defineConfig({ dbName: "app", debug: ["discovery", "info"] });
