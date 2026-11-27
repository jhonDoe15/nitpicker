let pending = ids.map((id) => repository.findById(id)); pending = []; await Promise.all(pending);
export {};
