export function group(pattern: RegExp, text: string): string {
  const found = pattern.exec(text)?.[1];
  if (found === undefined) {
    throw new Error(`No match for ${pattern.source}`);
  }
  return found;
}
