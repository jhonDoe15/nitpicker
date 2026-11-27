import type { Finding } from '../../../../shared/values/findings.mts';
import type { Cause } from '../../../../shared/rules/stability/stability-types.mts';
import type { LineSource } from '../../git/line-types.mts';

export type Metric = { readonly name: string; readonly value: number };

export type LineSpan = {
  readonly path: string;
  readonly startLine: number;
  readonly endLine: number;
};

export type Ratchet = {
  readonly key: string;
  readonly value: number;
  readonly folderFiles?: number;
  readonly declarationKey?: string;
  readonly worseMessage?: string;
  readonly worseAllowedForm?: string;
  readonly growthAdvice?: string;
  readonly growthAllowedForm?: string;
  readonly heldMessage?: string;
  readonly existingCodeOnly?: true;
  readonly pathIsFolder?: true;
  readonly divisible?: true;
  readonly mustKeepUnchangedLines?: readonly LineSpan[];
};

export type Anchor = { readonly key: string; readonly requireUnchangedLine?: true };

export type FixEdit = {
  readonly type: 'replace' | 'write';
  readonly path: string;
  readonly text: string;
  readonly start?: number;
  readonly end?: number;
};

export type FixField = {
  readonly recipe: string;
  readonly safety: 'safe' | 'review';
  readonly path?: string;
  readonly sha256?: string;
  readonly textLength?: number;
  readonly edits?: readonly FixEdit[];
};

export type TrackedFinding = Finding & {
  readonly metric?: Metric;
  readonly ratchet?: Ratchet;
  readonly anchor?: Anchor;
  readonly cause?: Cause;
  readonly tokens?: readonly string[];
  readonly allowedForm?: string;
  readonly helpUri?: string;
  readonly fix?: FixField;
  readonly heldAtBase?: number;
  readonly toolNotRun?: true;
  readonly notRunScope?: readonly string[];
  readonly notRunIdentityPrefix?: string;
  readonly exception?: unknown;
  readonly exceptionList?: unknown;
};

export type TouchedEntry = LineSource & {
  readonly added: boolean;
  readonly ranges: readonly (readonly [number, number])[];
  readonly inserted?: readonly (readonly [number, number])[];
  readonly deletions?: readonly number[];
};

export type ChangedLines = Pick<TouchedCode, 'changedLines'>;

export type MatchedCode = {
  readonly changedLines: ReadonlyMap<string, TouchedEntry>;
  readonly isStrictRule: (rule: string, finding: TrackedFinding) => boolean;
  readonly mustMeetOnEditedLines?: ((rule: string, finding: TrackedFinding) => boolean) | undefined;
};

export type TouchedCode = MatchedCode & {
  readonly testsRemoved: boolean;
  readonly removedTestTargets?: ReadonlySet<string> | undefined;
};

export type Advice = {
  readonly allowedForm?: string;
  readonly exception?: unknown;
  readonly exceptionList?: unknown;
};

export type ParsedReport = {
  readonly findings: TrackedFinding[];
  readonly moduleImports?: { readonly from: string; readonly to: string }[];
};

export type RatchetedFinding = TrackedFinding & { readonly ratchet: Ratchet };

export type AnchoredFinding = TrackedFinding & { readonly anchor: Anchor };

export type FindingPair = { readonly head: TrackedFinding; readonly base: TrackedFinding };
