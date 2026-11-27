import { DataSource } from "typeorm"; export async function start(redisClient) { await redisClient.synchronize(); }
