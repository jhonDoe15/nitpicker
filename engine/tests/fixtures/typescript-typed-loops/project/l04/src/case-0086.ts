let row; let i = 0; do { row = await repository.findById(ids[i]); i += 1; } while (row);
export {};
