export function panel(body: string): string {
  return `export function Panel({ items, a }) { ${body} return <div />; }`;
}
