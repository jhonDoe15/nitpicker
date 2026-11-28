for (const entry of entries) { try { await repository.save(entry); break; } catch { log(); } }
export {};
