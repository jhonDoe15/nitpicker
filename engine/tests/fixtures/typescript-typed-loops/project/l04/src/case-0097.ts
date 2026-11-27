const pending = ids.map((id) => repository.findById(id)); await Promise.all(pending);
export {};
