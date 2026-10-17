import type { ReactElement } from 'react';

export function List({ items }: { readonly items: readonly string[] }): ReactElement {
  return (
    <ul>
      {items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </ul>
  );
}
