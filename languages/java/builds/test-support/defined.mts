export function defined<Value>(value: Value | undefined): Value {
  if (value === undefined) {
    throw new TypeError('expected a value, got undefined');
  }
  return value;
}
