export function outerClass(className: string): string {
  return className.split('$')[0] ?? className;
}

export function simpleName(className: string): string {
  return className.slice(className.lastIndexOf('.') + 1);
}
