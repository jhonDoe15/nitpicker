for (const attempt of attempts) { try { const r = await fetch(url); break; } catch { wait(); } }
export {};
