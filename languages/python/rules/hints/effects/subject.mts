export const PATH_SEPARATOR = ' > ';
export const FIELD_SEPARATOR = '|';

export function splitPath(route = ''): string[] {
  return route.split(PATH_SEPARATOR);
}

export function parseEffect(subject = ''): { path: string[]; fields: string[] } {
  const [route = '', ...fields] = subject.split(FIELD_SEPARATOR);
  return { path: splitPath(route), fields };
}

export function pathPhrase(path: readonly string[]): string {
  const [first = '', ...rest] = path;
  if (rest.length === 0) {
    return `\`${first}\``;
  }
  const steps = rest.map((step) => `which calls \`${step}\``).join(', ');
  return `\`${first}\` (${steps})`;
}
