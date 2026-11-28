const pending = ids.map((id) => repository.findById(id)); for (const p of pending) { use(p); }
export {};
