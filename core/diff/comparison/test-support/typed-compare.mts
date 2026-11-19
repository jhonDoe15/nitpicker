import { fieldOf, listOf } from '../../../../shared/values/readers.mts';
import type { Finding } from '../../../../shared/values/findings.mts';
import {
  compareFindings as compareTracked,
  type CompareRequest as TrackedRequest,
} from '../compare.mts';
import type { DeclaredMoves } from '../moved-names/declared/move-types.mts';
import type { TrackedFinding } from '../model/finding-types.mts';

export type CompareRequest = {
  readonly baseFindings: readonly unknown[];
  readonly headFindings: readonly unknown[];
  readonly baseToHeadRenames?: Map<string, string> | undefined;
  readonly baseToHeadDirectories?: Map<string, string> | undefined;
  readonly baseToHeadPackages?: Map<string, string> | undefined;
  readonly baseToHeadDeclared?: DeclaredMoves | undefined;
  readonly touchedCode?: TrackedRequest['touchedCode'];
  readonly unknownOnBase?: ((finding: Finding) => boolean) | undefined;
};

export type ComparedFinding = {
  readonly identity: string;
  readonly path: string;
  readonly [field: string]: unknown;
};

export type Comparison = {
  readonly newFindings: ComparedFinding[];
  readonly resolvedFindings: ComparedFinding[];
  readonly unchangedFindings: ComparedFinding[];
  readonly changedMetrics: ComparedFinding[];
};

function isCompared(value: unknown): value is ComparedFinding {
  return (
    typeof fieldOf(value, 'identity') === 'string' && typeof fieldOf(value, 'path') === 'string'
  );
}

function comparedIn(result: unknown, key: string): ComparedFinding[] {
  return listOf(fieldOf(result, key)).filter(isCompared);
}

const REQUIRED_TEXT = ['tool', 'rule', 'path', 'identity', 'message', 'classification'];

function isTracked(value: unknown): value is TrackedFinding {
  return REQUIRED_TEXT.every((field) => typeof fieldOf(value, field) === 'string');
}

function trackedIn(findings: readonly unknown[]): TrackedFinding[] {
  return findings.map((finding) => {
    if (!isTracked(finding)) {
      throw new TypeError(
        'a compared finding needs tool, rule, path, identity, message, classification',
      );
    }
    return finding;
  });
}

export function compareFindings({
  baseFindings,
  headFindings,
  baseToHeadRenames,
  baseToHeadDirectories,
  baseToHeadPackages,
  baseToHeadDeclared,
  touchedCode,
  unknownOnBase,
}: CompareRequest): Comparison {
  const result = compareTracked({
    baseFindings: trackedIn(baseFindings),
    headFindings: trackedIn(headFindings),
    baseToHeadRenames,
    baseToHeadDirectories,
    baseToHeadPackages,
    baseToHeadDeclared,
    touchedCode,
    unknownOnBase,
  });
  return {
    newFindings: comparedIn(result, 'newFindings'),
    resolvedFindings: comparedIn(result, 'resolvedFindings'),
    unchangedFindings: comparedIn(result, 'unchangedFindings'),
    changedMetrics: comparedIn(result, 'changedMetrics'),
  };
}
