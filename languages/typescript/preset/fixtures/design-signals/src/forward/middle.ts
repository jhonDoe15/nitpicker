import { inner } from './inner';

export function middle(name: string, size: number): string {
  return inner(name, size);
}
