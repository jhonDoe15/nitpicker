await Promise.all(ids.map((id) => fetch(url(id))));
export {};
