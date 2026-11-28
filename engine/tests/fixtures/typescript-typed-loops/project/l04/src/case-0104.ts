const { request } = require('undici'); for (const id of ids) { await request(id); }
export {};
