import type { Toolkit } from '../model';

export function writePerson(kit: Toolkit, name: string, age: number): string {
  return kit.renderName(name) + kit.renderAge(age);
}
