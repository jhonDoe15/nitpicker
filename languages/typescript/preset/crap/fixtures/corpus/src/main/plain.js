export function sum(values) {
  let total = 0;
  for (const value of values) {
    total += value;
  }
  return total;
}

export const maybe = (object) => object?.value?.deep ?? null;
