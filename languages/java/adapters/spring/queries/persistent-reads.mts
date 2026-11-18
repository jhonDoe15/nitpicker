import path from 'node:path';
import { expressionAt, offsetOf, readJavaSource } from '../../review-rules/java-sources.mts';
import { firstOperation, loadsAll, readsOf } from './chain-reads.mts';
import { entityColumns } from './entity-columns.mts';
import type { JavaFinding } from '../../typed/java-values.mts';
import type { ChainReads, EntityColumns } from './query-types.mts';

const RULE = 'SpringDataFilterInQuery';

function readsColumns(columns: EntityColumns, { paths, references }: ChainReads): boolean {
  return (
    paths.every((getters) => getters.length === 0 || columns.readsColumns(getters)) &&
    references.every(({ type, getter }) => columns.isColumnOf(type, getter))
  );
}

function readsOfFinding(projectRoot: string, finding: JavaFinding): ChainReads | undefined {
  const text = readJavaSource(path.join(projectRoot, finding.path));
  if (text === undefined) {
    return undefined;
  }
  const offset = offsetOf(text, {
    line: finding.location?.line ?? 1,
    column: finding.location?.column,
  });
  const chain = firstOperation(expressionAt(text, offset));
  if (loadsAll(text, chain, offset)) {
    return undefined;
  }
  const reads = readsOf(chain);
  const none =
    reads.paths.every((getters) => getters.length === 0) && reads.references.length === 0;
  return none ? undefined : reads;
}

export function dropComputedReads<T extends JavaFinding>(
  findings: T[],
  { projectRoot, roots }: { projectRoot: string; roots: readonly string[] },
): T[] {
  let columns: EntityColumns | undefined;
  return findings.filter((finding) => {
    if (finding.tool !== 'pmd' || finding.rule !== RULE) {
      return true;
    }
    const reads = readsOfFinding(projectRoot, finding);
    if (reads === undefined) {
      return true;
    }
    columns ??= entityColumns(projectRoot, roots);
    return readsColumns(columns, reads);
  });
}
