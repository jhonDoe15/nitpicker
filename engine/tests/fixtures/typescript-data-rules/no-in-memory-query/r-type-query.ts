import { Repository } from 'typeorm';
declare const userRepo: Repository<{ id: number; parent: number }>;
export async function counted() {
  const rows = await userRepo.find();
  type Rows = typeof rows;
  return rows.length;
}
export async function qualified() {
  const rows = await userRepo.find();
  let size: typeof rows.length = 0;
  return rows.length + size;
}
export async function filtered(x: never) {
  const rows = await userRepo.find();
  const ids: typeof rows = x;
  return rows.filter((row) => ids.includes(row));
}
export async function plain() {
  const rows = await userRepo.find();
  return rows.length;
}
