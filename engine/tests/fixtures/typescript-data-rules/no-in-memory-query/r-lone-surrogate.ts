import { Repository } from 'typeorm';
declare const users: Repository<{ id: number }>;
declare const holder: Record<string, Repository<{ id: number }>>;
export async function locked() {
  const rows = await users.find({ comment: 'FOR UPDATE \uD83D' } as never);
  return rows.length;
}
export async function receiver() {
  const rows = await holder['\uD83Drepo'].find();
  return rows.length;
}
export async function field() {
  const rows = await users.find();
  return rows.filter((row) => row['\uD83D']);
}
