for (;;) { const current = await client.snapshot.get(name); if (current.state === 'active') { return true; } await new Promise((resolve) => setTimeout(resolve, 1000)); }
export {};
