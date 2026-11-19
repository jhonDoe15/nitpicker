import { databaseKinds } from '../../../../shared/hygiene/schema/database-kind.mjs';
import { schemaProjectFiles } from '../../../../shared/hygiene/schema/foreign-key-gate.mjs';
import type { JavaFinding } from '../typed/java-values.mts';

export const SEQUENCE_RULE = 'JpaSequenceIds';

type KindOf = (file: string) => string | undefined;

const kindsOf: (
  projectRoot: string,
  files: unknown,
  options: { separateMariadb: boolean },
) => KindOf = databaseKinds;
const projectFilesOf: (projectRoot: string) => unknown = schemaProjectFiles;

export function sequenceGate(projectRoot: string): (file: string) => boolean {
  let kindOf: KindOf | undefined;
  return (file) => {
    kindOf ??= kindsOf(projectRoot, projectFilesOf(projectRoot), { separateMariadb: true });
    return kindOf(file) !== 'mysql';
  };
}

export function withoutMysqlSequenceIds(
  findings: JavaFinding[],
  {
    projectRoot,
    checks,
  }: { projectRoot: string; checks?: ((file: string) => boolean) | undefined },
): JavaFinding[] {
  const sequences = checks ?? sequenceGate(projectRoot);
  return findings.filter(
    (finding) =>
      finding.tool !== 'pmd' || finding.rule !== SEQUENCE_RULE || sequences(finding.path),
  );
}
