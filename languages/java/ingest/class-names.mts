export function outerClass(className: string): string {
  return className.split('$')[0] ?? className;
}

export function simpleName(className: string): string {
  return className.slice(className.lastIndexOf('.') + 1);
}

export function packageOf(className: string): string {
  const index = className.lastIndexOf('.');
  return index < 0 ? '' : className.slice(0, index);
}
