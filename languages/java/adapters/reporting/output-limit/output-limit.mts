import {
  OUTPUT_LIMIT_RULE,
  fitFindings,
  outputLimitBytes,
  outputLimitMessage,
} from '../../../../../shared/report-output/fit-findings.mts';
import type { JavaEnvironment, JavaFinding } from '../../typed/java-values.mts';

type Snapshot = { readonly findings: readonly JavaFinding[] };

const NOTE_RESERVE_BYTES = 64 * 1024;

export function withinOutputLimit<T extends Snapshot>(
  snapshot: T,
  analyzer: string,
  environment: JavaEnvironment,
): T {
  const limitBytes = outputLimitBytes(environment);
  if (limitBytes === undefined) {
    return snapshot;
  }
  const restBytes = Buffer.byteLength(JSON.stringify({ ...snapshot, findings: [] }));
  const { findings, cut } = fitFindings(
    snapshot.findings,
    limitBytes - restBytes - NOTE_RESERVE_BYTES,
  );
  if (cut.length === 0) {
    return snapshot;
  }
  return {
    ...snapshot,
    findings: [
      ...findings,
      {
        tool: analyzer,
        rule: OUTPUT_LIMIT_RULE,
        path: '.',
        identity: OUTPUT_LIMIT_RULE,
        message: outputLimitMessage(analyzer, cut, limitBytes),
        classification: 'tool-error',
      },
    ],
  };
}
