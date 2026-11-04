import { middle } from './middle';

export function outer(name: string, size: number): string {
  return middle(name, size);
}
