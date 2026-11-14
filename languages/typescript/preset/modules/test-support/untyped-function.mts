export function functionOf<Fn extends (...parameters: never[]) => unknown>(value: unknown): Fn {
  function isFunction(candidate: unknown): candidate is Fn {
    return typeof candidate === 'function';
  }
  if (!isFunction(value)) {
    throw new TypeError('Expected a function');
  }
  return value;
}
