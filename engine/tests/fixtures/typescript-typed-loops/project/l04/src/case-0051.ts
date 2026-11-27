for (let i = 0; i < rows.length; i += 500) { const part = rows.slice(i, i + 500); await repository.insertMany(part); }
export {};
