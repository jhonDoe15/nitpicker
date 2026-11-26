import { closeSync, openSync, writeSync } from 'node:fs';

export const SET_KINDS = ['file', 'rule', 'typedFile', 'typedRule'] as const;
export const FINDING_KIND = 'finding';

export type SetKind = (typeof SET_KINDS)[number];

export type ReplaySections = Readonly<Record<SetKind, readonly string[]>> & {
  readonly finding: readonly unknown[];
};

export function isSetKind(kind: unknown): kind is SetKind {
  return SET_KINDS.some((each) => each === kind);
}

function appendRow(descriptor: number, kind: string, value: unknown): void {
  writeSync(descriptor, `${JSON.stringify([kind, value])}\n`);
}

export function writeReplay(file: string, sections: ReplaySections): void {
  const descriptor = openSync(file, 'w');
  try {
    for (const kind of [...SET_KINDS, FINDING_KIND] as const) {
      for (const value of sections[kind]) {
        appendRow(descriptor, kind, value);
      }
    }
  } finally {
    closeSync(descriptor);
  }
}
