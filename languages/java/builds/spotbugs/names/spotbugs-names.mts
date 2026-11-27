export const CONSTRUCTOR = 'new ';
export function classOf(method: string): string {
  const signature = method.slice(0, method.indexOf('('));
  return signature.startsWith(CONSTRUCTOR)
    ? signature.slice(CONSTRUCTOR.length)
    : signature.slice(0, signature.lastIndexOf('.'));
}

export function packageOf(binary: string): string {
  const dot = binary.lastIndexOf('.');
  return dot === -1 ? '' : binary.slice(0, dot);
}

export function withoutPackage(qualified: string, owner: string): string {
  const local = packageOf(owner);
  return local === '' ? qualified : qualified.slice(local.length + 1);
}

export function ownerOf(kind: string, qualified: string): string {
  if (kind === 'type') {
    return qualified;
  }
  if (kind === 'member') {
    return qualified.slice(0, qualified.lastIndexOf('.'));
  }
  const method = kind === 'variable' ? qualified.slice(0, qualified.lastIndexOf('#')) : qualified;
  return classOf(method);
}

export function placeName(kind: string, qualified: string, owner: string): string {
  if (kind === 'variable') {
    return qualified.slice(qualified.lastIndexOf('#') + 1);
  }
  if (kind !== 'function') {
    return withoutPackage(qualified, owner);
  }
  if (qualified.startsWith(CONSTRUCTOR)) {
    return `${CONSTRUCTOR}${withoutPackage(qualified.slice(CONSTRUCTOR.length), owner)}`;
  }
  const open = qualified.indexOf('(');
  return qualified.slice(qualified.lastIndexOf('.', open) + 1);
}

export function relativeName(qualified: string, shown: string): string {
  const local = packageOf(shown);
  return local !== '' && packageOf(classOf(qualified)) === local
    ? qualified.slice(local.length + 1)
    : qualified;
}

export function fieldName(qualified: string, owner: string, reader: string): string {
  const local = packageOf(reader);
  if (local === '' && owner === reader) {
    return qualified.slice(qualified.lastIndexOf('.') + 1);
  }
  return packageOf(owner) === local ? withoutPackage(qualified, owner) : qualified;
}
