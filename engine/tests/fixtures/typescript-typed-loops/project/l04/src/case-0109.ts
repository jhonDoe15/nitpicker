while (more()) { const page = await api.list(); use(page); }
export {};
