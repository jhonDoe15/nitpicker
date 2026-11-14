import { declineNote } from './names.mjs';

export function outcomeOf(candidate, result) {
  if (result.edits === undefined) {
    return { note: declineNote(candidate.reported, result.declined) };
  }
  return { fix: { finding: candidate.reported, edits: result.edits } };
}

export function collected(outcomes, notes) {
  return {
    fixes: outcomes.flatMap(({ fix }) => (fix === undefined ? [] : [fix])),
    notes: [...notes, ...outcomes.flatMap(({ note }) => (note === undefined ? [] : [note]))],
  };
}
