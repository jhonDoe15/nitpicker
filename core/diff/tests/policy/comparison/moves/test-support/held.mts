import { compareFindings } from '../../../../../comparison/compare.mts';
import type { DeclaredMoves } from '../../../../../comparison/moved-names/declared/move-types.mts';
import type { TrackedFinding } from '../../../../../comparison/model/finding-types.mts';
import { fieldOf } from '../../../../../../../shared/values/readers.mts';

export type Held = {
  readonly renames?: Map<string, string>;
  readonly directories?: Map<string, string>;
  readonly packages?: Map<string, string>;
  readonly declared?: DeclaredMoves;
};

const REQUIRED_TEXT = ['tool', 'rule', 'path', 'identity', 'message', 'classification'];

function tracked(value: unknown): TrackedFinding {
  if (!isTracked(value)) {
    throw new TypeError('a held finding needs tool, rule, path, identity, message, classification');
  }
  return value;
}

function isTracked(value: unknown): value is TrackedFinding {
  return REQUIRED_TEXT.every((field) => typeof fieldOf(value, field) === 'string');
}

export function held(base: unknown, head: unknown, moves: Held): { fresh: number; kept: number } {
  const comparison = compareFindings({
    baseFindings: [tracked(base)],
    headFindings: [tracked(head)],
    baseToHeadRenames: moves.renames ?? new Map(),
    baseToHeadDirectories: moves.directories ?? new Map(),
    baseToHeadPackages: moves.packages ?? new Map(),
    ...(moves.declared === undefined ? {} : { baseToHeadDeclared: moves.declared }),
    touchedCode: undefined,
  });
  return { fresh: comparison.newFindings.length, kept: comparison.unchangedFindings.length };
}
