export function outerClass(className) {
  return className.split('$')[0];
}

export function simpleName(className) {
  return className.slice(className.lastIndexOf('.') + 1);
}
