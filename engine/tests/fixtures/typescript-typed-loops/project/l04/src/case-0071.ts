for (const id of ids) { try { return await repository.findById(id); } catch (error) { throw error; } }
export {};
