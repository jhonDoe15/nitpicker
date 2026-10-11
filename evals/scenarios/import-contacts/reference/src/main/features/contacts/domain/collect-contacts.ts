type Contact = { readonly name: string; readonly email: string };

type Rejection = { readonly index: number; readonly reason: string };

export type Candidate =
  | { readonly kind: 'valid'; readonly contact: Contact }
  | { readonly kind: 'invalid'; readonly reason: string };

export type ImportResult =
  | {
      readonly kind: 'imported';
      readonly contacts: readonly Contact[];
      readonly rejected: readonly Rejection[];
    }
  | { readonly kind: 'read-failed'; readonly message: string }
  | { readonly kind: 'malformed-json' }
  | { readonly kind: 'not-an-array' };

type Accepted = { readonly index: number; readonly contact: Contact };

type Tally = { readonly accepted: readonly Accepted[]; readonly rejected: readonly Rejection[] };

const EMPTY_TALLY: Tally = { accepted: [], rejected: [] };

function admit(tally: Tally, candidate: Candidate, index: number): Tally {
  if (candidate.kind === 'invalid') {
    return {
      accepted: tally.accepted,
      rejected: [...tally.rejected, { index, reason: candidate.reason }],
    };
  }
  const earlier = tally.accepted.find((entry) => entry.contact.email === candidate.contact.email);
  if (earlier !== undefined) {
    return {
      accepted: tally.accepted,
      rejected: [...tally.rejected, { index, reason: `duplicate of #${String(earlier.index)}` }],
    };
  }
  return {
    accepted: [...tally.accepted, { index, contact: candidate.contact }],
    rejected: tally.rejected,
  };
}

export function collectContacts(candidates: readonly Candidate[]): ImportResult {
  const tally = candidates.reduce(admit, EMPTY_TALLY);
  return {
    kind: 'imported',
    contacts: tally.accepted.map((entry) => entry.contact),
    rejected: tally.rejected,
  };
}
