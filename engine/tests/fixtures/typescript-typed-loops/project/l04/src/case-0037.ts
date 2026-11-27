const settled = ids.map((id) => api.send(id)); await Promise.allSettled(settled);
export {};
