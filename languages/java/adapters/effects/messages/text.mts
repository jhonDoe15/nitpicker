export function code(text: string): string {
  return `\`${text}\``;
}

export function callPath(path: readonly string[]): string {
  const [first = '', ...rest] = path.map(code);
  return rest.length === 0 ? `calls ${first}` : `calls ${[first, ...rest].join(', which calls ')}`;
}
