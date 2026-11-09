export function connect(host: string, port: number, secure: boolean): string {
  return `${secure ? 'https' : 'http'}://${host}:${String(port)}`;
}

export function probe(host: string, port: number, secure: boolean): boolean {
  return host.length > 0 && port > 0 && secure;
}
