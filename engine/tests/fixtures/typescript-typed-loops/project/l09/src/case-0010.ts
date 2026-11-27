for (;;) { const rows = await db.select().from(events).limit(500); if (!rows.length) break; await db.delete(events).where(inArray(events.id, rows.map((row) => row.id))); }
export {};
