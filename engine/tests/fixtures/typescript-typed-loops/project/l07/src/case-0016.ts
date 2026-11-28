let latest = first; for (const id of ids) { const row = await repo.findOne({ where: { previousId: latest.id } }); latest = other; }
export {};
