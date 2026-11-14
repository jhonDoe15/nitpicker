export function bindPair(env, left, right) {
  if (env.forward.has(left) || env.backward.has(right)) {
    return env.forward.get(left) === right && env.backward.get(right) === left;
  }
  env.forward.set(left, right);
  env.backward.set(right, left);
  return true;
}
