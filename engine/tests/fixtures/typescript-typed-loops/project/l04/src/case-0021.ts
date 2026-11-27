while (retries-- > 0) { try { await api.send(body); break; } catch { wait(); } }
export {};
