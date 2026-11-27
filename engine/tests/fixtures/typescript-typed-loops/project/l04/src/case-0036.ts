let done = false; while (!done) { const r = await client.poll(job); done = r.finished; }
export {};
