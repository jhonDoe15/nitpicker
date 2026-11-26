export type User = { id: string };
export declare function fetchUser(id: string): User;
export declare function fetchWith(id: string, retry?: number): User;
export async function loadRemote(id: string): Promise<User> {
  return { id };
}
