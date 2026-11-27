let latest = first; for (const id of ids) { latest = await repo.findOne({ where: { previousId: latest.id } }); }
export {};
