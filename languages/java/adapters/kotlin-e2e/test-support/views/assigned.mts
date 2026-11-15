export function assigned<T>(value: T | undefined, name: string): T {
  if (value === undefined) {
    throw new Error(`${name} is read before the fixture is set up`);
  }
  return value;
}
