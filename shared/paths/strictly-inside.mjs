import path from 'node:path';

export function isStrictlyInside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}
