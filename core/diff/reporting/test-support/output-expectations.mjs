function escaped(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function exactText(parts, ...values) {
  const pattern = parts.reduce((result, part, index) => {
    const value = values[index];
    const insertion = value instanceof RegExp ? value.source : escaped(value ?? '');
    return result + escaped(part) + insertion;
  }, '');
  return new RegExp(`^(?:${pattern})(?![^])`);
}
