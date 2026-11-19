export function inLoop(statement: string): string {
  return `for (const id of ids) { ${statement} }`;
}

export function onceFor(code: string, messageId = 'query'): { code: string; errors: object[] } {
  return { code, errors: [{ messageId }] };
}
