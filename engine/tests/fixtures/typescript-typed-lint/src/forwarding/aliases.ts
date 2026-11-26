import { fetchUser, fetchWith, loadRemote } from './api';

type Item = { id: string };

class Base {
  sum(items: Item[]): number {
    return items.length;
  }
}

export class Cart {
  sum(items: Item[]): number {
    return items.length;
  }
  total(items: Item[]): number {
    return this.sum(items);
  }
  private count(items: Item[]): number {
    return items.length;
  }
  size(items: Item[]): number {
    return this.count(items);
  }
  scaled(items: Item[]): number {
    return this.sum(items) * 2;
  }
}

export class Child extends Base {
  total(items: Item[]): number {
    return this.sum(items);
  }
}

export function loadUser(id: string) {
  return fetchUser(id);
}

export const loadWith = (id: string, retry?: number) => fetchWith(id, retry);

const loadLocal = async (id: string) => await loadRemote(id);

export async function loadAsync(id: string) {
  return loadLocal(id);
}

export function lookup(id: string) {
  return fetchUser(id).id;
}
