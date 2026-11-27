for (const id of ids) { await redisClient.get(id); }
export {};
