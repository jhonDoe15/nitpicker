import type { DecisionQuestion } from '../typed/solver-types.mts';
import type { Finding } from '../../values/findings.mts';

type AheadAnswers = {
  isNoting: () => boolean;
  find: (id: string) => unknown;
  note: (id: string, request: DecisionQuestion) => void;
  noted: (run: () => unknown, keepSettled: boolean) => [string, DecisionQuestion][];
  settledOr: (key: object, run: () => Finding[]) => Finding[];
  keep: (found: Iterable<[string, unknown]>) => void;
  forget: () => void;
};

export function aheadAnswers(): AheadAnswers {
  const known = new Map<string, unknown>();
  const asked = new Map<string, DecisionQuestion>();
  const settledParts = new Map<object, Finding[]>();
  const state = { noting: false, settling: false, notes: 0 };
  return {
    isNoting: () => state.noting,
    find: (id) => known.get(id),
    note(id, request) {
      state.notes += 1;
      asked.set(id, request);
    },
    noted(run, keepSettled) {
      state.noting = true;
      state.settling = keepSettled;
      try {
        run();
        return [...asked];
      } finally {
        state.noting = false;
        state.settling = false;
        asked.clear();
      }
    },
    settledOr(key, run) {
      const kept = settledParts.get(key);
      if (kept !== undefined) {
        return kept;
      }
      const before = state.notes;
      const result = run();
      if (state.settling && state.notes === before) {
        settledParts.set(key, result);
      }
      return result;
    },
    keep(found) {
      for (const [id, result] of found) {
        known.set(id, result);
      }
    },
    forget() {
      known.clear();
      settledParts.clear();
    },
  };
}
