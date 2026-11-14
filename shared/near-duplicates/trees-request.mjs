export function isText(value) {
  return typeof value === 'string';
}

export function fileRequest(value) {
  if (typeof value === 'object' && value !== null && 'root' in value && 'files' in value) {
    const { root, files } = value;
    if (isText(root) && Array.isArray(files) && files.every(isText)) {
      return { root, files };
    }
  }
  throw new TypeError('The trees request must be { root, files } with text values');
}
