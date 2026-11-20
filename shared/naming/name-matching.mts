export const WORD_BREAK = /(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])|[_\-\s]+/u;

export function normalized(name: string): string {
  return name.replaceAll(/[^a-z0-9]/giu, '').toLowerCase();
}

export function headWord(name: string): string {
  return (name.split(WORD_BREAK).at(-1) ?? '').toLowerCase().replace(/s$/u, '');
}
