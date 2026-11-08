import path from 'node:path';
import { expressionAt, offsetOf, readJavaSource } from '../../review-rules/java-sources.mjs';
import { firstOperation, loadsAll, readsOf } from './chain-reads.mjs';
import { entityColumns } from './entity-columns.mjs';

const RULE = 'SpringDataFilterInQuery';

function readsColumns(columns, { paths, references }) {
  return (
    paths.every((getters) => getters.length === 0 || columns.readsColumns(getters)) &&
    references.every(({ type, getter }) => columns.isColumnOf(type, getter))
  );
}

function readsOfFinding(projectRoot, finding) {
  const text = readJavaSource(path.join(projectRoot, finding.path));
  if (text === undefined) {
    return undefined;
  }
  const offset = offsetOf(text, finding.location ?? { line: 1 });
  const chain = firstOperation(expressionAt(text, offset));
  if (loadsAll(text, chain, offset)) {
    return undefined;
  }
  const reads = readsOf(chain);
  const none =
    reads.paths.every((getters) => getters.length === 0) && reads.references.length === 0;
  return none ? undefined : reads;
}

export function dropComputedReads(findings, { projectRoot, roots }) {
  let columns;
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
