export function code(text) {
  return `\`${text}\``;
}

export function callPath(path) {
  const [first, ...rest] = path.map(code);
  return rest.length === 0 ? `calls ${first}` : `calls ${[first, ...rest].join(', which calls ')}`;
}
