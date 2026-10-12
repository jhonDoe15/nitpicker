type RecordInput = {
  readonly id: string;
  readonly enabled: boolean;
  readonly score: number;
};

export function EnabledRecords({ records }: { readonly records: readonly RecordInput[] }) {
  const ids = records
    .filter((record) => record.enabled)
    .map((record) => ({ id: record.id.trim(), score: record.score }))
    .filter((record) => record.id.length > 0 && record.score >= 0)
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))
    .map((record) => record.id);
  return (
    <ul>
      {ids.map((id) => (
        <li key={id}>{id}</li>
      ))}
    </ul>
  );
}
