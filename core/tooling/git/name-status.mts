export type NameStatus = { readonly status: string; readonly from: string; readonly to: string };

export function nameStatusEntries(output: string): NameStatus[] {
  return output
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => {
      const [status = '', from = '', to = from] = line.split('\t');
      return { status, from, to };
    });
}
