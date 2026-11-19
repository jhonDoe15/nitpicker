const PLACEHOLDER = /%([sdifjoO%])/gu;

export function placeholderCount(text: string): number {
  return [...text.matchAll(PLACEHOLDER)].filter((match) => match[1] !== '%').length;
}
