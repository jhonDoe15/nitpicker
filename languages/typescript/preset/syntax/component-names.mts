const COMPONENT_NAME = /^[A-Z][A-Za-z0-9]*$/u;

export function isComponentName(name: string | undefined): boolean {
  return name !== undefined && COMPONENT_NAME.test(name);
}
