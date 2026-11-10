export function listen(host: string, port: number, secure: boolean): string {
  return `${host}:${String(port)}:${String(secure)}`;
}
