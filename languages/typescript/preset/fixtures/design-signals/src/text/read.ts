import type { Toolkit } from '../model';

export function readPerson(kit: Toolkit, name: string, age: string): [string, number] {
  return [kit.parseName(name), kit.parseAge(age)];
}
