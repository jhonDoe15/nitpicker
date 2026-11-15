export function prefixesOf(text, separator) {
  const segments = text.split(separator);
  return segments.slice(1).map((_, index) => segments.slice(0, index + 1).join(separator));
}
