import type { JavaFinding } from '../../typed/java-values.mts';

export function pmdFindingsKept<T extends JavaFinding, Index>(
  findings: readonly T[],
  { rules, build, keep }: PmdFilter<T, Index>,
): T[] {
  let index: Index | undefined;
  function indexed(): Index {
    index ??= build();
    return index;
  }
  return findings.filter(
    (finding) => finding.tool !== 'pmd' || !rules(finding.rule) || keep(finding, indexed),
  );
}

type PmdFilter<T extends JavaFinding, Index> = {
  readonly rules: (rule: string) => boolean;
  readonly build: () => Index;
  readonly keep: (finding: T, index: () => Index) => boolean;
};
