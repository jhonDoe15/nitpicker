import { MemoryStore, type Store } from "../ports";
import { SystemClock } from "../clock";

const café = "😀";
const store: Store = new MemoryStore();
export const loaded = store.load(café);
const { save: keep } = store;
keep("a", "b");
const key = "onChange" as const;
store[key]("x");
export function later(clock: SystemClock): number {
  const { now } = clock;
  void now;
  return clock["tick"] === undefined ? 0 : 1;
}
store.__flush();
const { __drain } = store;
void __drain;
