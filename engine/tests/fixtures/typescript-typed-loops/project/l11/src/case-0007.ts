const make = () => { for (const id of ids) { const role = roleRepo.create({ slug: id }); return role; } };
export {};
