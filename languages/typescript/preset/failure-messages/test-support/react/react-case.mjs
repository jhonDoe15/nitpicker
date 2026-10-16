export function panel(body) {
  return `export function Panel({ items, a }) { ${body} return <div />; }`;
}

export function exceptionCase([name, banned]) {
  return [`${name} names the config exception`, banned, 'nitpicker.config.json'];
}
