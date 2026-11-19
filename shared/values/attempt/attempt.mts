export type Attempt<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: unknown };

export function attempt<T>(run: () => T): Attempt<T> {
  try {
    return { ok: true, value: run() };
  } catch (error) {
    return { ok: false, error };
  }
}

export function valueOr<T, F>(run: () => T, fallback: F): T | F {
  const result = attempt(run);
  return result.ok ? result.value : fallback;
}
