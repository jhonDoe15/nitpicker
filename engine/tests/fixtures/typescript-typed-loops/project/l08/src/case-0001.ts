const deadline = Date.now() + timeout; while (Date.now() < deadline) { const status = await client.getStatus(job); if (status.done) break; await sleep(500); }
export {};
