export const find = (id: string) => pool.query(`SELECT * FROM users WHERE id = ${id}`);
