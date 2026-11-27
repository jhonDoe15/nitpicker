for (let attempt = 1; attempt <= 3; attempt++) { try { return await client.get(url); } catch { wait(); } }
export {};
