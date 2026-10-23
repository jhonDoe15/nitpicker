export const PATH_SEPARATOR = ' > ';
export const FIELD_SEPARATOR = '|';

export function splitPath(route = '') {
  return route.split(PATH_SEPARATOR);
}

export function parseEffect(subject = '') {
  const [route = '', ...fields] = subject.split(FIELD_SEPARATOR);
  return { path: splitPath(route), fields };
}

export function pathPhrase(path) {
  const [first, ...rest] = path;
  if (rest.length === 0) {
    return `\`${first}\``;
  }
  const steps = rest.map((step) => `which calls \`${step}\``).join(', ');
  return `\`${first}\` (${steps})`;
}
