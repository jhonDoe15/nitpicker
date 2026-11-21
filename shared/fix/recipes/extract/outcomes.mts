import { declineNote } from './names.mts';
import type { Collected, Outcome, Reported } from './typed/extract-types.mts';

export function outcomeOf<Found extends Reported, Edit>(
  candidate: { readonly reported: Found },
  result: { readonly edits?: readonly Edit[] | undefined; readonly declined?: string | undefined },
): Outcome<{ finding: Found; edits: readonly Edit[] }> {
  if (result.edits === undefined) {
    return { note: declineNote(candidate.reported, String(result.declined)) };
  }
  return { fix: { finding: candidate.reported, edits: result.edits } };
}

export function collected<Fix>(
  outcomes: readonly Outcome<Fix>[],
  notes: readonly string[],
): Collected<Fix> {
  return {
    fixes: outcomes.flatMap(({ fix }) => (fix === undefined ? [] : [fix])),
    notes: [...notes, ...outcomes.flatMap(({ note }) => (note === undefined ? [] : [note]))],
  };
}
