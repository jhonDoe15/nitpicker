import type TypeScript from 'typescript';
import { bindPair as untypedBindPair } from '../../../../../../shared/fix/recipes/extract/bijection.mjs';
import {
  partialCandidates as untypedPartialCandidates,
  wholeCandidates as untypedWholeCandidates,
} from '../../../../../../shared/fix/recipes/extract/candidates.mjs';
import {
  declineNote as untypedDeclineNote,
  helperNameFor as untypedHelperNameFor,
  namedHoles as untypedNamedHoles,
} from '../../../../../../shared/fix/recipes/extract/names.mjs';
import {
  collected as untypedCollected,
  outcomeOf as untypedOutcomeOf,
} from '../../../../../../shared/fix/recipes/extract/outcomes.mjs';
import {
  dedentedToLeast as untypedDedentedToLeast,
  indentedBy as untypedIndentedBy,
  withLineEndingOf as untypedWithLineEndingOf,
} from '../../../../../../shared/fix/recipes/extract/text.mjs';
import { statementWindows as untypedStatementWindows } from '../../../../../../shared/fix/recipes/extract/windows.mjs';
import { nearDuplicateMatches as untypedNearDuplicateMatches } from '../../../../../../shared/rules/near-duplicates/near-duplicates.mjs';
import type { Planned, ProjectFix, ReplaceEdit } from '../../typed/project-types.mts';
import type { AlignEnv, Candidate, Candidates, PartialCandidate } from './extract-types.mts';

type Outcome =
  | { readonly note: string; readonly fix?: undefined }
  | { readonly fix: ProjectFix; readonly note?: undefined };

const bindPair: (
  env: AlignEnv,
  left: TypeScript.Symbol | undefined,
  right: TypeScript.Symbol | undefined,
) => boolean = untypedBindPair;

const wholeCandidates: (matches: unknown) => Candidates<Candidate> = untypedWholeCandidates;

const partialCandidates: (matches: unknown) => Candidates<PartialCandidate> =
  untypedPartialCandidates;

const declineNote: (
  finding: { readonly path: string; readonly line: number },
  reason: string,
) => string = untypedDeclineNote;

const namedHoles: <
  Hole extends { readonly occurrences: readonly [{ readonly a: Node }, ...unknown[]] },
  Node,
>(
  holes: readonly Hole[],
  taken: Iterable<string>,
  stemOf: (node: Node) => string | undefined,
) => (Hole & { readonly name: string })[] | undefined = untypedNamedHoles;

const helperNameFor: (label: string, taken: ReadonlySet<string>) => string | undefined =
  untypedHelperNameFor;

const outcomeOf: (candidate: Candidate, result: Planned<ReplaceEdit>) => Outcome = untypedOutcomeOf;

const collected: (
  outcomes: readonly Outcome[],
  notes: readonly string[],
) => { readonly fixes: ProjectFix[]; readonly notes: string[] } = untypedCollected;

const dedentedToLeast: (text: string) => string = untypedDedentedToLeast;

const indentedBy: (text: string, prefix: string) => string = untypedIndentedBy;

const withLineEndingOf: (source: string, text: string) => string = untypedWithLineEndingOf;

const statementWindows: <T>(list: readonly T[]) => T[][] = untypedStatementWindows;

const nearDuplicateMatches: (
  units: readonly object[],
  options: { readonly isExcepted: (ruleId: string, name: string) => boolean },
) => unknown = untypedNearDuplicateMatches;

export {
  bindPair,
  collected,
  declineNote,
  dedentedToLeast,
  helperNameFor,
  indentedBy,
  namedHoles,
  nearDuplicateMatches,
  outcomeOf,
  partialCandidates,
  statementWindows,
  wholeCandidates,
  withLineEndingOf,
};
