interface RecordInput {
  readonly id: string;
  readonly enabled: boolean;
  readonly score: number;
}

export function selectEnabledRecords(records: readonly RecordInput[]): readonly string[] {
  return records
    .filter((record) => record.enabled)
    .map((record) => ({ id: record.id.trim(), score: record.score }))
    .filter((record) => record.id.length > 0 && record.score >= 0)
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))
    .map((record) => record.id);
}
