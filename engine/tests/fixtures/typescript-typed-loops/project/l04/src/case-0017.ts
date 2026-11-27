for (const attempt of attempts) { try { return await client.get(url); } catch (error) { wait(attempt); } }
export {};
