const started = Date.now(); do { const state = await repository.findOne({ where: { id: jobId } }); if (state.finished) break; } while (Date.now() - started < limit);
export {};
