export const registry = new Map<string, number>();
const hidden: string[] = [];
export let counter = 0;
let queue: string[] = [];
let log: string[] = [];
export const limit = 5;
export const handler = (value: number): number => value + limit;

queue = [];

export function bump(): number {
  log.push('x');
  return hidden.length + counter;
}
