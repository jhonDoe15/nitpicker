export const ENGINE_FINDINGS_FILE = 'NITPICKER_ENGINE_LINT_FINDINGS';

const source: { file: string | undefined } = { file: undefined };

export function replayEngineFindingsFrom(file: string | undefined): void {
  source.file = file;
}

export function engineFindingsFile(): string | undefined {
  return source.file;
}
