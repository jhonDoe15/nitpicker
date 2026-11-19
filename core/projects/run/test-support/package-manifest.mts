export function manifest(name: string, dependencies: object = {}): string {
  return JSON.stringify({ name, version: '1.0.0', dependencies });
}
