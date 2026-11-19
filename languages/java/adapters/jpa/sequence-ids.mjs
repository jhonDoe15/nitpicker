import { databaseKinds } from '../../../../shared/hygiene/schema/database-kind.mjs';
import { schemaProjectFiles } from '../../../../shared/hygiene/schema/foreign-key-gate.mjs';

export const SEQUENCE_RULE = 'JpaSequenceIds';

export function sequenceGate(projectRoot) {
  let kindOf;
  return (file) => {
    kindOf ??= databaseKinds(projectRoot, schemaProjectFiles(projectRoot), {
      separateMariadb: true,
    });
    return kindOf(file) !== 'mysql';
  };
}

export function withoutMysqlSequenceIds(findings, { projectRoot, checks }) {
  const sequences = checks ?? sequenceGate(projectRoot);
  return findings.filter(
    (finding) =>
      finding.tool !== 'pmd' || finding.rule !== SEQUENCE_RULE || sequences(finding.path),
  );
}
