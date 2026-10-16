export function leadingSpaces(line) {
  return line.length - line.trimStart().length;
}

export function indentOf(line) {
  return line.trim().length === 0 ? Infinity : leadingSpaces(line);
}
