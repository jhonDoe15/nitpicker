export type RerunVerdict = {
  readonly pinned: ReadonlySet<string>;
  readonly loadSensitive: ReadonlySet<string>;
};

export const NO_RERUN_VERDICT: RerunVerdict = { pinned: new Set(), loadSensitive: new Set() };

export function testKey(file: string, name: string): string {
  return `${file} > ${name}`;
}
