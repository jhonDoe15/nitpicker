import { Sequelize } from "sequelize"; import { store } from "./store.js"; export async function start(cache) { await store.sync(); await cache.sync(); }
