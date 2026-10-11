import { useState } from 'react';

type Item = { readonly id: string; readonly label: string };

export function Counter({ items }: { readonly items: readonly Item[] }) {
  const [count, setCount] = useState(0);
  const total = count * items.length;
  return (
    <ul className="counter" data-total={total}>
      {items.map((item) => (
        <li key={item.id}>
          <button
            type="button"
            onClick={async () => {
              setCount(count + 1);
              await Promise.resolve();
            }}
          >
            {item.label}
          </button>
          <img src="/icon.png" alt="" />
        </li>
      ))}
    </ul>
  );
}
