import type { Z3 } from '../typed/solver-types.mts';

export const solverContext = loadOnce<Z3>(async () => {
  const { init } = await import('z3-solver');
  const { Context } = await init();
  return Context('nitpicker-logic');
});

function loadOnce<Loaded>(load: () => Promise<Loaded>): () => Promise<Loaded> {
  const loaded: Promise<Loaded>[] = [];
  return () => {
    const [existing] = loaded;
    if (existing !== undefined) {
      return existing;
    }
    const started = load();
    loaded.push(started);
    return started;
  };
}
