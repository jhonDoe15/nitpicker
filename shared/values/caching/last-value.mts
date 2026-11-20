type Last<Value> = { key: string | undefined; value: Value | undefined };

/**
 * `create(input)` remembered for the key it was last asked for: callers that ask with the same
 * key one after another, such as every rule that looks at one file, share one computation, and
 * nothing is kept for earlier keys.
 */
export function lastValue<Input, Value>(
  keyOf: (input: Input) => string,
  create: (input: Input) => Value,
): (input: Input) => Value {
  const last: Last<Value> = { key: undefined, value: undefined };
  return (input) => {
    const key = keyOf(input);
    if (last.key !== key || last.value === undefined) {
      last.value = create(input);
      last.key = key;
    }
    return last.value;
  };
}
